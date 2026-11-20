/**
 * Service layer for the Media Tracker.
 *
 * Owns business rules (status lifecycle, progress tracking, defaults) and
 * orchestrates selectors + DML. Contains no SOQL and knows nothing about
 * the UI - controllers, flows, batch jobs or REST endpoints can all reuse it.
 */
public with sharing class MediaItemService {
  public static final String STATUS_PLANNED = 'Planned';
  public static final String STATUS_IN_PROGRESS = 'In Progress';
  public static final String STATUS_ON_HOLD = 'On Hold';
  public static final String STATUS_COMPLETED = 'Completed';
  public static final String STATUS_DROPPED = 'Dropped';

  // Injectable so unit tests can swap in stubs.
  @TestVisible
  private static MediaItemSelector itemSelector = new MediaItemSelector();
  @TestVisible
  private static MediaTypeConfigSelector typeConfigSelector = new MediaTypeConfigSelector();

  public class MediaServiceException extends Exception {
  }

  // ------------------------------------------------------------------ reads

  public static MediaPageData getMediaPage(MediaFilterData filter) {
    MediaFilterData normalized = (filter ?? new MediaFilterData()).normalize();
    if (
      !normalized.collectionIds.isEmpty() && normalized.includeSubCollections
    ) {
      // Picking "MCU" also shows items filed under "MCU › Infinity Saga".
      normalized.collectionIds = new List<Id>(
        MediaCollectionService.expandWithDescendants(
          new Set<Id>(normalized.collectionIds)
        )
      );
    }
    List<Media_Item__c> records = itemSelector.selectByFilter(normalized);
    Integer totalCount = itemSelector.countByFilter(normalized);
    return new MediaPageData(
      MediaItemData.fromRecords(records),
      totalCount,
      normalized.pageOffset
    );
  }

  public static MediaItemData getMediaItem(Id recordId) {
    return new MediaItemData(requireRecord(recordId));
  }

  /**
   * Active media types in display order. The picklist is the source of truth
   * for which values exist; Media_Type_Config__mdt layers behaviour on top.
   * A picklist value without a config record still appears with defaults.
   */
  public static List<MediaTypeConfigData> getTypeConfigs() {
    Map<String, Media_Type_Config__mdt> configs = typeConfigSelector.selectAllByMediaType();
    List<MediaTypeConfigData> result = new List<MediaTypeConfigData>();
    Integer position = 0;

    for (
      Schema.PicklistEntry entry : Media_Item__c.Media_Type__c.getDescribe()
        .getPicklistValues()
    ) {
      position++;
      if (!entry.isActive()) {
        continue;
      }
      Media_Type_Config__mdt config = configs.get(entry.getValue());
      if (config != null && config.Is_Active__c == false) {
        continue;
      }
      MediaTypeConfigData data = new MediaTypeConfigData(
          entry.getValue(),
          entry.getLabel()
        )
        .applyConfig(config);
      if (config == null) {
        data.sortOrder = 1000 + position; // unconfigured types go last, in picklist order
      }
      result.add(data);
    }
    result.sort(new TypeConfigComparator());
    return result;
  }

  /** Library statistics, optionally restricted to some media types. */
  public static MediaStatsData getStats(List<String> mediaTypes) {
    MediaFilterData scope = new MediaFilterData();
    scope.mediaTypes = mediaTypes;
    scope.normalize();

    MediaStatsData stats = new MediaStatsData();

    Map<String, Integer> statusCounts = toCountMap(
      itemSelector.selectCountsGroupedBy('Status__c', scope)
    );
    for (
      Schema.PicklistEntry entry : Media_Item__c.Status__c.getDescribe()
        .getPicklistValues()
    ) {
      Integer count = statusCounts.get(entry.getValue()) ?? 0;
      stats.byStatus.add(
        new MediaStatsData.Bucket(entry.getValue(), entry.getLabel(), count)
      );
      stats.total += count;
    }

    Map<String, Integer> typeCounts = toCountMap(
      itemSelector.selectCountsGroupedBy('Media_Type__c', scope)
    );
    for (MediaTypeConfigData type : getTypeConfigs()) {
      Integer count = typeCounts.get(type.value);
      if (count != null && count > 0) {
        stats.byType.add(
          new MediaStatsData.Bucket(type.value, type.label, count)
        );
      }
    }

    Decimal avg = itemSelector.selectAverageRating(scope);
    stats.averageRating = avg == null
      ? null
      : avg.setScale(1, System.RoundingMode.HALF_UP);

    scope.favoritesOnly = true;
    stats.favorites = itemSelector.countByFilter(scope);
    return stats;
  }

  // ----------------------------------------------------------------- writes

  /** Creates or updates an item after applying defaults and lifecycle rules. */
  public static MediaItemData saveMediaItem(MediaItemData item) {
    if (item == null) {
      throw new MediaServiceException('No media item was provided.');
    }
    if (String.isBlank(item.title)) {
      throw new MediaServiceException('Title is required.');
    }
    if (String.isBlank(item.mediaType)) {
      throw new MediaServiceException('Media type is required.');
    }
    if (item.id != null) {
      requireRecord(item.id); // ownership check
    }
    if (item.collectionId != null) {
      MediaCollectionService.requireCollection(item.collectionId); // must be one of the user's collections
    }

    Media_Item__c rec = item.toRecord();
    if (String.isBlank(rec.Status__c)) {
      rec.Status__c = STATUS_PLANNED;
    }
    applyLifecycleRules(rec, tracksProgress(rec.Media_Type__c));
    // An aired date implies the release year when none was entered.
    if (rec.Release_Year__c == null && rec.Aired_Date__c != null) {
      rec.Release_Year__c = rec.Aired_Date__c.year();
    }

    upsert as user rec;

    // seasons == null means "not sent": leave existing seasons alone.
    if (item.seasons != null && tracksSeasons(rec.Media_Type__c)) {
      MediaSeasonService.saveSeasons(
        rec.Id,
        item.seasons,
        rec.Status__c == STATUS_COMPLETED
      );
    }
    if (item.movies != null && tracksMovies(rec.Media_Type__c)) {
      MediaSeasonService.saveMovies(
        rec.Id,
        item.movies,
        rec.Status__c == STATUS_COMPLETED
      );
    }
    return getMediaItem(rec.Id);
  }

  /**
   * Moves progress by +/- step (e.g. "watched one more episode").
   * Items with seasons step through their seasons in order; others move the
   * overall counter. Status follows progress (see applyProgressRules).
   */
  public static MediaItemData incrementProgress(Id recordId, Integer step) {
    Media_Item__c rec = requireRecord(recordId);
    Integer delta = step ?? 1;

    if (MediaSeasonService.stepEpisode(rec.Media_Seasons__r, delta)) {
      return getMediaItem(rec.Id); // MediaSeasonTrigger recalculated the item
    }

    Integer current =
      (rec.Progress_Current__c == null
        ? 0
        : rec.Progress_Current__c.intValue()) + delta;
    current = Math.max(0, current);
    if (rec.Progress_Total__c != null) {
      current = Math.min(current, rec.Progress_Total__c.intValue());
    }
    rec.Progress_Current__c = current;

    Boolean totalKnown = rec.Progress_Total__c != null;
    Boolean reachedEnd =
      totalKnown &&
      rec.Progress_Total__c > 0 &&
      current >= rec.Progress_Total__c;
    applyProgressRules(rec, reachedEnd, totalKnown);

    update as user rec;
    return getMediaItem(rec.Id);
  }

  public static MediaItemData toggleFavorite(Id recordId) {
    Media_Item__c rec = requireRecord(recordId);
    update as user new Media_Item__c(
      Id = rec.Id,
      Is_Favorite__c = !rec.Is_Favorite__c
    );
    return getMediaItem(rec.Id);
  }

  public static void deleteMediaItem(Id recordId) {
    Media_Item__c rec = requireRecord(recordId);
    delete as user rec;
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Makes the status follow progress after progress changed:
   * - reached the end                         -> Completed
   * - Completed but no longer at a known end  -> In Progress (Planned if nothing watched)
   * - Planned with some progress              -> In Progress
   * On Hold and Dropped are only changed when the end is reached.
   * Then applies the date/progress lifecycle rules.
   */
  public static void applyProgressRules(
    Media_Item__c rec,
    Boolean reachedEnd,
    Boolean totalKnown
  ) {
    Boolean hasProgress =
      rec.Progress_Current__c != null &&
      rec.Progress_Current__c > 0;
    if (reachedEnd) {
      rec.Status__c = STATUS_COMPLETED;
    } else if (rec.Status__c == STATUS_COMPLETED && totalKnown) {
      rec.Status__c = hasProgress ? STATUS_IN_PROGRESS : STATUS_PLANNED;
    } else if (rec.Status__c == STATUS_PLANNED && hasProgress) {
      rec.Status__c = STATUS_IN_PROGRESS;
    }
    applyLifecycleRules(rec, true);
  }

  /**
   * Keeps dates and progress consistent with the status:
   * - Completed   -> completed date defaults to today; progress jumps to total
   * - not Completed -> completed date cleared
   * - anything past Planned -> start date defaults to today
   */
  @TestVisible
  private static void applyLifecycleRules(
    Media_Item__c rec,
    Boolean tracksProgress
  ) {
    if (rec.Progress_Current__c == null) {
      rec.Progress_Current__c = 0;
    }

    if (rec.Status__c == STATUS_COMPLETED) {
      rec.Completed_Date__c = rec.Completed_Date__c ?? Date.today();
      if (tracksProgress && rec.Progress_Total__c != null) {
        rec.Progress_Current__c = rec.Progress_Total__c;
      }
    } else {
      rec.Completed_Date__c = null;
    }

    if (rec.Status__c != STATUS_PLANNED && rec.Start_Date__c == null) {
      rec.Start_Date__c = rec.Completed_Date__c ?? Date.today();
    }
  }

  private static Boolean tracksProgress(String mediaType) {
    Media_Type_Config__mdt config = typeConfigSelector.selectAllByMediaType()
      .get(mediaType);
    return config != null && config.Tracks_Progress__c == true;
  }

  private static Boolean tracksSeasons(String mediaType) {
    Media_Type_Config__mdt config = typeConfigSelector.selectAllByMediaType()
      .get(mediaType);
    return config != null &&
      config.Tracks_Progress__c == true &&
      config.Tracks_Seasons__c == true;
  }

  private static Boolean tracksMovies(String mediaType) {
    Media_Type_Config__mdt config = typeConfigSelector.selectAllByMediaType()
      .get(mediaType);
    return config != null && config.Tracks_Movies__c == true;
  }

  private static Media_Item__c requireRecord(Id recordId) {
    if (recordId == null) {
      throw new MediaServiceException('A record Id is required.');
    }
    Media_Item__c rec = itemSelector.selectById(recordId);
    if (rec == null) {
      throw new MediaServiceException(
        'Media item not found or you do not have access to it.'
      );
    }
    return rec;
  }

  private static Map<String, Integer> toCountMap(
    List<AggregateResult> results
  ) {
    Map<String, Integer> counts = new Map<String, Integer>();
    for (AggregateResult ar : results) {
      counts.put((String) ar.get('grp'), (Integer) ar.get('cnt'));
    }
    return counts;
  }

  private class TypeConfigComparator implements Comparator<MediaTypeConfigData> {
    public Integer compare(MediaTypeConfigData a, MediaTypeConfigData b) {
      return a.sortOrder - b.sortOrder;
    }
  }
}

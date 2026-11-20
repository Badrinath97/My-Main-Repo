/**
 * Service for seasons of episodic media (TV series, anime...).
 *
 * When an item has seasons, its overall progress is derived from them:
 *   Progress_Current__c = SUM(Episodes_Watched__c)
 *   Progress_Total__c   = SUM(Episode_Count__c), or blank while any season's count is unknown
 * syncParentProgress() keeps that true. It runs from MediaSeasonTrigger, so it
 * also covers seasons edited on the record page, by Data Loader, flows, etc.
 *
 * The same object also holds movies related to the series (Entry_Type__c =
 * Movie). Movies are a separate watched/not-watched list: they never count
 * toward the episode progress and +1/-1 skips them.
 */
public with sharing class MediaSeasonService {
  @TestVisible
  private static MediaSeasonSelector seasonSelector = new MediaSeasonSelector();
  @TestVisible
  private static MediaItemSelector itemSelector = new MediaItemSelector();

  /**
   * Replaces an item's seasons with the given list: new rows are inserted,
   * existing rows updated, and rows missing from the list deleted.
   * @param markAllWatched true when the item is being marked Completed
   */
  public static void saveSeasons(
    Id mediaItemId,
    List<MediaSeasonData> seasons,
    Boolean markAllWatched
  ) {
    validateSeasons(seasons);
    for (MediaSeasonData season : seasons) {
      season.entryType = MediaSeasonData.TYPE_SEASON;
    }
    replaceEntries(
      mediaItemId,
      MediaSeasonData.TYPE_SEASON,
      seasons,
      markAllWatched
    );
  }

  /**
   * Replaces an item's related movies with the given list. Movies are
   * numbered by their position in the list; seasons are left untouched.
   * @param markAllWatched true when the item is being marked Completed
   */
  public static void saveMovies(
    Id mediaItemId,
    List<MediaSeasonData> movies,
    Boolean markAllWatched
  ) {
    Integer position = 0;
    for (MediaSeasonData movie : movies) {
      position++;
      movie.entryType = MediaSeasonData.TYPE_MOVIE;
      movie.seasonNumber = position;
      if (String.isBlank(movie.name)) {
        throw new MediaItemService.MediaServiceException(
          'Each movie needs a title.'
        );
      }
    }
    replaceEntries(
      mediaItemId,
      MediaSeasonData.TYPE_MOVIE,
      movies,
      markAllWatched
    );
  }

  /** Upserts the given entries and deletes the item's other entries of that type. */
  private static void replaceEntries(
    Id mediaItemId,
    String entryType,
    List<MediaSeasonData> entries,
    Boolean markAllWatched
  ) {
    Map<Id, Media_Season__c> existing = new Map<Id, Media_Season__c>(
      MediaSeasonData.filterByType(
        seasonSelector.selectByMediaItemIds(new Set<Id>{ mediaItemId }),
        entryType
      )
    );

    List<Media_Season__c> toUpsert = new List<Media_Season__c>();
    for (MediaSeasonData season : entries) {
      if (season.id != null && !existing.containsKey(season.id)) {
        throw new MediaItemService.MediaServiceException(
          entryType +
            ' ' +
            (season.isMovie()
              ? season.name
              : String.valueOf(season.seasonNumber)) +
            ' does not belong to this item.'
        );
      }
      Media_Season__c rec = season.toRecord(mediaItemId);
      if (markAllWatched == true && rec.Episode_Count__c != null) {
        rec.Episodes_Watched__c = rec.Episode_Count__c;
      }
      toUpsert.add(rec);
      existing.remove(season.id);
    }

    if (!existing.isEmpty()) {
      delete as user existing.values();
    }
    if (!toUpsert.isEmpty()) {
      upsert as user toUpsert;
    }
  }

  /**
   * Moves one step through the episodes, crossing season boundaries:
   * +1 advances the first unfinished season, -1 rewinds the last started one.
   * @return false if the item has no seasons (caller falls back to plain progress)
   */
  public static Boolean stepEpisode(
    List<Media_Season__c> seasons,
    Integer step
  ) {
    seasons = MediaSeasonData.filterByType(
      seasons,
      MediaSeasonData.TYPE_SEASON
    );
    if (seasons.isEmpty()) {
      return false;
    }
    Media_Season__c target = step >= 0
      ? firstUnfinished(seasons)
      : lastStarted(seasons);
    if (target == null) {
      return true; // already at the very end / very start: nothing to do
    }

    Integer watched = intOf(target.Episodes_Watched__c) + step;
    watched = Math.max(0, watched);
    if (target.Episode_Count__c != null) {
      watched = Math.min(watched, target.Episode_Count__c.intValue());
    }
    update as user new Media_Season__c(
      Id = target.Id,
      Episodes_Watched__c = watched
    );
    return true;
  }

  /** Entry point for MediaSeasonTrigger. */
  public static void syncFromSeasons(List<Media_Season__c> changedSeasons) {
    Set<Id> itemIds = new Set<Id>();
    for (Media_Season__c season : changedSeasons) {
      if (season.Media_Item__c != null) {
        itemIds.add(season.Media_Item__c);
      }
    }
    syncParentProgress(itemIds);
  }

  /** Recalculates progress and status of the given items from their seasons. */
  public static void syncParentProgress(Set<Id> mediaItemIds) {
    if (mediaItemIds == null || mediaItemIds.isEmpty()) {
      return;
    }
    Map<Id, List<Media_Season__c>> seasonsByItem = seasonSelector.selectGroupedByMediaItem(
      mediaItemIds
    );

    List<Media_Item__c> changed = new List<Media_Item__c>();
    for (
      Media_Item__c item : itemSelector.selectForProgressSync(mediaItemIds)
    ) {
      List<Media_Season__c> seasons = MediaSeasonData.filterByType(
        seasonsByItem.get(item.Id),
        MediaSeasonData.TYPE_SEASON
      );
      if (seasons.isEmpty()) {
        continue; // no seasons (maybe only movies): keep the item's own progress values
      }
      Media_Item__c before = item.clone(true, true, false, false);

      Integer watched = 0;
      Integer episodes = 0;
      Boolean allCountsKnown = true;
      for (Media_Season__c season : seasons) {
        watched += intOf(season.Episodes_Watched__c);
        if (season.Episode_Count__c == null) {
          allCountsKnown = false;
        } else {
          episodes += season.Episode_Count__c.intValue();
        }
      }

      item.Progress_Current__c = watched;
      item.Progress_Total__c = allCountsKnown ? episodes : null;
      Boolean reachedEnd =
        allCountsKnown &&
        episodes > 0 &&
        watched >= episodes;
      MediaItemService.applyProgressRules(item, reachedEnd, allCountsKnown);

      if (hasChanged(before, item)) {
        changed.add(item);
      }
    }
    if (!changed.isEmpty()) {
      update as user changed;
    }
  }

  // ---------------------------------------------------------------- helpers

  @TestVisible
  private static void validateSeasons(List<MediaSeasonData> seasons) {
    Set<Integer> seen = new Set<Integer>();
    for (MediaSeasonData season : seasons) {
      if (season.seasonNumber == null || season.seasonNumber < 0) {
        throw new MediaItemService.MediaServiceException(
          'Each season needs a season number of 0 or more.'
        );
      }
      if (!seen.add(season.seasonNumber)) {
        throw new MediaItemService.MediaServiceException(
          'Season ' + season.seasonNumber + ' is listed more than once.'
        );
      }
    }
  }

  private static Media_Season__c firstUnfinished(
    List<Media_Season__c> seasons
  ) {
    for (Media_Season__c season : seasons) {
      if (
        season.Episode_Count__c == null ||
        intOf(season.Episodes_Watched__c) < season.Episode_Count__c
      ) {
        return season;
      }
    }
    return null;
  }

  private static Media_Season__c lastStarted(List<Media_Season__c> seasons) {
    for (Integer i = seasons.size() - 1; i >= 0; i--) {
      if (intOf(seasons[i].Episodes_Watched__c) > 0) {
        return seasons[i];
      }
    }
    return null;
  }

  private static Boolean hasChanged(Media_Item__c before, Media_Item__c after) {
    return before.Status__c != after.Status__c ||
      before.Progress_Current__c != after.Progress_Current__c ||
      before.Progress_Total__c != after.Progress_Total__c ||
      before.Start_Date__c != after.Start_Date__c ||
      before.Completed_Date__c != after.Completed_Date__c;
  }

  private static Integer intOf(Decimal value) {
    return value == null ? 0 : value.intValue();
  }
}

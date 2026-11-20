@IsTest
private class MediaSeasonServiceTest {
  @TestSetup
  static void setup() {
    MediaTestDataFactory.createTrackerUser();
  }

  private static MediaSeasonData season(
    Integer seasonNumber,
    Integer episodeCount,
    Integer episodesWatched
  ) {
    MediaSeasonData data = new MediaSeasonData();
    data.seasonNumber = seasonNumber;
    data.episodeCount = episodeCount;
    data.episodesWatched = episodesWatched;
    return data;
  }

  private static MediaItemData saveSeries(
    String status,
    List<MediaSeasonData> seasons
  ) {
    MediaItemData input = MediaTestDataFactory.buildData(
      'Dark',
      'TV Series',
      status
    );
    input.seasons = seasons;
    return MediaItemService.saveMediaItem(input);
  }

  @IsTest
  static void overallProgressIsCalculatedFromSeasons() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'Planned',
        new List<MediaSeasonData>{ season(1, 10, 10), season(2, 8, 3) }
      );

      Assert.areEqual(13, saved.progressCurrent);
      Assert.areEqual(18, saved.progressTotal);
      Assert.areEqual(72, saved.progressPercent);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, saved.status);
      Assert.areEqual(2, saved.seasons.size());
      Assert.isTrue(saved.seasons[0].isComplete);
      Assert.areEqual('Season 1', saved.seasons[0].name);
      Assert.areEqual(2, saved.currentSeasonNumber);
    }
  }

  @IsTest
  static void plusOneCrossesSeasonBoundariesAndCompletes() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'In Progress',
        new List<MediaSeasonData>{ season(1, 2, 1), season(2, 2, 0) }
      );

      MediaItemData step1 = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(2, step1.seasons[0].episodesWatched);
      Assert.areEqual(2, step1.currentSeasonNumber, 'Season 1 finished');

      MediaItemData step2 = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(1, step2.seasons[1].episodesWatched);
      Assert.areEqual(3, step2.progressCurrent);

      MediaItemData step3 = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, step3.status);
      Assert.areEqual(Date.today(), step3.completedDate);

      MediaItemData atEnd = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(4, atEnd.progressCurrent, 'Nothing past the end');

      MediaItemData back = MediaItemService.incrementProgress(saved.id, -1);
      Assert.areEqual(1, back.seasons[1].episodesWatched);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, back.status);
      Assert.isNull(back.completedDate);
    }
  }

  @IsTest
  static void unknownEpisodeCountLeavesTotalBlank() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'In Progress',
        new List<MediaSeasonData>{ season(1, 10, 10), season(2, null, 4) }
      );
      Assert.areEqual(14, saved.progressCurrent);
      Assert.isNull(saved.progressTotal, 'Season 2 is still airing');

      MediaItemData next = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(5, next.seasons[1].episodesWatched);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, next.status);
    }
  }

  @IsTest
  static void markingCompletedFillsEverySeason() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'Completed',
        new List<MediaSeasonData>{ season(1, 5, 0), season(2, 6, 2) }
      );
      Assert.areEqual(11, saved.progressCurrent);
      Assert.areEqual(11, saved.progressTotal);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, saved.status);
      Assert.isTrue(saved.seasons[1].isComplete);
    }
  }

  @IsTest
  static void savingReplacesSeasonsAndNullLeavesThemAlone() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'In Progress',
        new List<MediaSeasonData>{ season(1, 10, 2), season(2, 8, 0) }
      );

      saved.seasons.remove(1);
      saved.seasons[0].episodeCount = 12;
      MediaItemData trimmed = MediaItemService.saveMediaItem(saved);
      Assert.areEqual(1, trimmed.seasons.size());
      Assert.areEqual(12, trimmed.progressTotal);

      trimmed.seasons = null; // e.g. a caller that does not know about seasons
      trimmed.genre = 'Sci-Fi';
      MediaItemData untouched = MediaItemService.saveMediaItem(trimmed);
      Assert.areEqual(1, untouched.seasons.size());
    }
  }

  @IsTest
  static void editingSeasonRecordsDirectlyKeepsItemInSync() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData item = saveSeries('Planned', new List<MediaSeasonData>());

      Media_Season__c s1 = new Media_Season__c(
        Media_Item__c = item.id,
        Name = 'Season 1',
        Season_Number__c = 1,
        Episode_Count__c = 6,
        Episodes_Watched__c = 6
      );
      insert s1; // as if created on the record page

      MediaItemData afterInsert = MediaItemService.getMediaItem(item.id);
      Assert.areEqual(6, afterInsert.progressTotal);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, afterInsert.status);

      delete s1;
      MediaItemData afterDelete = MediaItemService.getMediaItem(item.id);
      Assert.areEqual(
        6,
        afterDelete.progressTotal,
        'With no seasons left the item keeps its last values'
      );
    }
  }

  @IsTest
  static void invalidSeasonListsAreRejected() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      assertSaveFails(
        new List<MediaSeasonData>{ season(1, 5, 0), season(1, 5, 0) },
        'Season 1 is listed more than once.'
      );
      assertSaveFails(
        new List<MediaSeasonData>{ season(null, 5, 0) },
        'Each season needs a season number of 0 or more.'
      );

      MediaSeasonData foreign = season(1, 5, 0);
      foreign.id = MediaItemService.saveMediaItem(
          withSeasons(new List<MediaSeasonData>{ season(1, 3, 0) })
        )
        .seasons[0]
        .id;
      try {
        MediaItemService.saveMediaItem(
          withSeasons(new List<MediaSeasonData>{ foreign })
        );
        Assert.fail('Expected a season from another item to be rejected');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.isTrue(e.getMessage().contains('does not belong'));
      }
    }
  }

  @IsTest
  static void typesWithoutSeasonsIgnoreSeasonData() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData movie = MediaTestDataFactory.buildData(
        'Inception',
        'Movie',
        'Planned'
      );
      movie.seasons = new List<MediaSeasonData>{ season(1, 1, 0) };
      MediaItemData saved = MediaItemService.saveMediaItem(movie);
      Assert.isTrue(saved.seasons.isEmpty());
    }
  }

  @IsTest
  static void decrementingACompletedItemReopensIt() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData input = MediaTestDataFactory.buildData(
        'Arcane',
        'Anime',
        'Completed'
      );
      input.progressTotal = 1;
      MediaItemData saved = MediaItemService.saveMediaItem(input);
      Assert.areEqual(1, saved.progressCurrent);

      MediaItemData reopened = MediaItemService.incrementProgress(saved.id, -1);
      Assert.areEqual(0, reopened.progressCurrent);
      Assert.areEqual(MediaItemService.STATUS_PLANNED, reopened.status);
    }
  }

  @IsTest
  static void typeConfigExposesSeasonFlag() {
    Boolean seriesTracksSeasons = false;
    Boolean movieTracksSeasons = true;
    for (MediaTypeConfigData config : MediaItemService.getTypeConfigs()) {
      if (config.value == 'TV Series') {
        seriesTracksSeasons = config.tracksSeasons;
      } else if (config.value == 'Movie') {
        movieTracksSeasons = config.tracksSeasons;
      }
    }
    Assert.isTrue(seriesTracksSeasons);
    Assert.isFalse(movieTracksSeasons);
  }

  private static MediaItemData withSeasons(List<MediaSeasonData> seasons) {
    MediaItemData input = MediaTestDataFactory.buildData(
      'Severance',
      'TV Series',
      'Planned'
    );
    input.seasons = seasons;
    return input;
  }

  private static void assertSaveFails(
    List<MediaSeasonData> seasons,
    String expectedMessage
  ) {
    try {
      MediaItemService.saveMediaItem(withSeasons(seasons));
      Assert.fail('Expected: ' + expectedMessage);
    } catch (MediaItemService.MediaServiceException e) {
      Assert.areEqual(expectedMessage, e.getMessage());
    }
  }
}

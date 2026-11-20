@IsTest
private class MediaTrackerControllerTest {
  @TestSetup
  static void setup() {
    MediaTestDataFactory.createTrackerUser();
  }

  @IsTest
  static void endToEndHappyPath() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Test.startTest();
      Assert.isFalse(MediaTrackerController.getTypeConfigs().isEmpty());

      MediaItemData input = MediaTestDataFactory.buildData(
        'Attack on Titan',
        'Anime',
        'Planned'
      );
      input.progressTotal = 3;
      MediaItemData saved = MediaTrackerController.saveMediaItem(input);
      Assert.isNotNull(saved.id);

      MediaItemData progressed = MediaTrackerController.incrementProgress(
        saved.id,
        1
      );
      Assert.areEqual(1, progressed.progressCurrent);

      Assert.isTrue(MediaTrackerController.toggleFavorite(saved.id).isFavorite);

      MediaPageData page = MediaTrackerController.getMediaItems(
        new MediaFilterData()
      );
      Assert.areEqual(1, page.totalCount);

      MediaStatsData stats = MediaTrackerController.getStats(
        new List<String>{ 'Anime' }
      );
      Assert.areEqual(1, stats.total);

      MediaTrackerController.deleteMediaItem(saved.id);
      Assert.areEqual(0, MediaTrackerController.getMediaItems(null).totalCount);
      Test.stopTest();
    }
  }

  @IsTest
  static void serviceErrorsBecomeAuraHandledExceptions() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      try {
        MediaTrackerController.saveMediaItem(
          MediaTestDataFactory.buildData(null, 'Movie', null)
        );
        Assert.fail('Expected an AuraHandledException');
      } catch (AuraHandledException e) {
        Assert.areEqual('Title is required.', e.getMessage());
      }
      try {
        MediaTrackerController.deleteMediaItem(null);
        Assert.fail('Expected an AuraHandledException');
      } catch (AuraHandledException e) {
        Assert.areEqual('A record Id is required.', e.getMessage());
      }
      try {
        MediaTrackerController.incrementProgress(null, 1);
        Assert.fail('Expected an AuraHandledException');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
      try {
        MediaTrackerController.toggleFavorite(null);
        Assert.fail('Expected an AuraHandledException');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
  }

  @IsTest
  static void dmlErrorsSurfaceValidationMessage() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData input = MediaTestDataFactory.buildData(
        'Bad Rating',
        'Movie',
        'Planned'
      );
      input.rating = 42;
      try {
        MediaTrackerController.saveMediaItem(input);
        Assert.fail('Expected validation rule to fire');
      } catch (AuraHandledException e) {
        Assert.areEqual('Rating must be between 0 and 10.', e.getMessage());
      }
    }
  }
}

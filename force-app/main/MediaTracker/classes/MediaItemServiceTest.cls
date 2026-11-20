@IsTest
private class MediaItemServiceTest {
  @TestSetup
  static void setup() {
    User u = MediaTestDataFactory.createTrackerUser();
    System.runAs(u) {
      Media_Item__c inception = MediaTestDataFactory.buildItem(
        'Inception',
        'Movie',
        'Completed'
      );
      inception.Rating__c = 9;
      inception.Is_Favorite__c = true;
      Media_Item__c frieren = MediaTestDataFactory.buildItem(
        'Frieren',
        'Anime',
        'In Progress'
      );
      frieren.Progress_Current__c = 10;
      frieren.Progress_Total__c = 28;
      frieren.Rating__c = 10;
      frieren.Genre__c = 'Fantasy';
      Media_Item__c dark = MediaTestDataFactory.buildItem(
        'Dark',
        'TV Series',
        'Planned'
      );
      dark.Progress_Total__c = 2;
      Media_Item__c dune = MediaTestDataFactory.buildItem(
        'Dune',
        'Book',
        'On Hold'
      );
      Media_Item__c hades = MediaTestDataFactory.buildItem(
        'Hades',
        'Video Game',
        'Dropped'
      );
      insert new List<Media_Item__c>{ inception, frieren, dark, dune, hades };
    }
  }

  private static Id idOf(String title) {
    return [SELECT Id FROM Media_Item__c WHERE Name = :title LIMIT 1].Id;
  }

  @IsTest
  static void saveNewItemDefaultsToPlanned() {
    MediaItemData input = MediaTestDataFactory.buildData(
      '  Arrival ',
      'Movie',
      null
    );

    MediaItemData saved;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Test.startTest();
      saved = MediaItemService.saveMediaItem(input);
      Test.stopTest();
    }

    Assert.isNotNull(saved.id);
    Assert.areEqual('Arrival', saved.title, 'Title should be trimmed');
    Assert.areEqual(MediaItemService.STATUS_PLANNED, saved.status);
    Assert.isNull(saved.startDate, 'Planned items have not started');
    Assert.isNull(saved.completedDate);
  }

  @IsTest
  static void saveCompletedFillsProgressAndDates() {
    MediaItemData input = MediaTestDataFactory.buildData(
      'Cowboy Bebop',
      'Anime',
      'Completed'
    );
    input.progressTotal = 26;
    input.progressCurrent = 3;

    MediaItemData saved;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      saved = MediaItemService.saveMediaItem(input);
    }

    Assert.areEqual(
      26,
      saved.progressCurrent,
      'Completing a tracked item fills progress'
    );
    Assert.areEqual(100, saved.progressPercent);
    Assert.areEqual(Date.today(), saved.completedDate);
    Assert.areEqual(Date.today(), saved.startDate);
  }

  @IsTest
  static void reopeningClearsCompletedDate() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData item = MediaItemService.getMediaItem(idOf('Inception'));
      item.status = MediaItemService.STATUS_IN_PROGRESS;
      item.completedDate = Date.today().addDays(-3);

      MediaItemData saved = MediaItemService.saveMediaItem(item);

      Assert.isNull(saved.completedDate);
      Assert.isNotNull(saved.startDate);
    }
  }

  @IsTest
  static void saveRequiresTitleAndType() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      try {
        MediaItemService.saveMediaItem(
          MediaTestDataFactory.buildData(' ', 'Movie', null)
        );
        Assert.fail('Expected missing title to fail');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.areEqual('Title is required.', e.getMessage());
      }
      try {
        MediaItemService.saveMediaItem(
          MediaTestDataFactory.buildData('X', null, null)
        );
        Assert.fail('Expected missing type to fail');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.areEqual('Media type is required.', e.getMessage());
      }
    }
  }

  @IsTest
  static void incrementProgressStartsThenCompletes() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Id darkId = idOf('Dark');

      MediaItemData afterFirst = MediaItemService.incrementProgress(darkId, 1);
      Assert.areEqual(1, afterFirst.progressCurrent);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, afterFirst.status);
      Assert.areEqual(50, afterFirst.progressPercent);
      Assert.areEqual(Date.today(), afterFirst.startDate);

      MediaItemData afterSecond = MediaItemService.incrementProgress(
        darkId,
        null
      ); // null step = +1
      Assert.areEqual(2, afterSecond.progressCurrent);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, afterSecond.status);
      Assert.areEqual(Date.today(), afterSecond.completedDate);

      MediaItemData overshoot = MediaItemService.incrementProgress(darkId, 5);
      Assert.areEqual(
        2,
        overshoot.progressCurrent,
        'Progress is clamped to the total'
      );
    }
  }

  @IsTest
  static void decrementNeverGoesBelowZero() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData result = MediaItemService.incrementProgress(
        idOf('Frieren'),
        -50
      );
      Assert.areEqual(0, result.progressCurrent);
    }
  }

  @IsTest
  static void toggleFavoriteFlipsFlag() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Id duneId = idOf('Dune');
      Assert.isTrue(MediaItemService.toggleFavorite(duneId).isFavorite);
      Assert.isFalse(MediaItemService.toggleFavorite(duneId).isFavorite);
    }
  }

  @IsTest
  static void deleteRemovesItem() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Id hadesId = idOf('Hades');
      MediaItemService.deleteMediaItem(hadesId);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Media_Item__c WHERE Id = :hadesId]
      );
    }
  }

  @IsTest
  static void cannotTouchAnotherUsersItem() {
    User someoneElse;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      someoneElse = MediaTestDataFactory.createTrackerUser('MediaSomeoneElse');
    }
    Media_Item__c foreign = MediaTestDataFactory.buildItem(
      'Not Mine',
      'Movie',
      'Planned'
    );
    System.runAs(someoneElse) {
      insert foreign;
    }

    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      try {
        MediaItemService.deleteMediaItem(foreign.Id);
        Assert.fail('Expected access to be denied');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.isTrue(e.getMessage().contains('not found'));
      }
    }
  }

  @IsTest
  static void getMediaPageFiltersSearchesAndPaginates() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaPageData all = MediaItemService.getMediaPage(null);
      Assert.areEqual(5, all.totalCount);
      Assert.isFalse(all.hasMore);

      MediaFilterData byType = new MediaFilterData();
      byType.mediaTypes = new List<String>{ 'Anime', 'Movie' };
      Assert.areEqual(2, MediaItemService.getMediaPage(byType).totalCount);

      MediaFilterData search = new MediaFilterData();
      search.searchTerm = 'fanta'; // matches genre
      MediaPageData searched = MediaItemService.getMediaPage(search);
      Assert.areEqual(1, searched.totalCount);
      Assert.areEqual('Frieren', searched.items[0].title);

      MediaFilterData favorites = new MediaFilterData();
      favorites.favoritesOnly = true;
      Assert.areEqual(
        'Inception',
        MediaItemService.getMediaPage(favorites).items[0].title
      );

      MediaFilterData paged = new MediaFilterData();
      paged.sortBy = 'title';
      paged.sortDirection = 'ASC';
      paged.pageSize = 2;
      MediaPageData firstPage = MediaItemService.getMediaPage(paged);
      Assert.areEqual(2, firstPage.items.size());
      Assert.isTrue(firstPage.hasMore);
      Assert.areEqual('Dark', firstPage.items[0].title);

      paged.pageOffset = 4;
      MediaPageData lastPage = MediaItemService.getMediaPage(paged);
      Assert.areEqual(1, lastPage.items.size());
      Assert.isFalse(lastPage.hasMore);
    }
  }

  @IsTest
  static void getStatsSummarisesLibrary() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaStatsData stats = MediaItemService.getStats(null);

      Assert.areEqual(5, stats.total);
      Assert.areEqual(1, stats.favorites);
      Assert.areEqual(9.5, stats.averageRating);
      Assert.areEqual(
        Media_Item__c.Status__c.getDescribe().getPicklistValues().size(),
        stats.byStatus.size(),
        'Every status is listed, even with zero items'
      );
      Assert.areEqual(5, stats.byType.size());

      MediaStatsData animeOnly = MediaItemService.getStats(
        new List<String>{ 'Anime' }
      );
      Assert.areEqual(1, animeOnly.total);
      Assert.areEqual(10.0, animeOnly.averageRating);
    }
  }

  @IsTest
  static void getTypeConfigsMergesPicklistAndMetadata() {
    List<MediaTypeConfigData> configs;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      configs = MediaItemService.getTypeConfigs();
    }

    Assert.isFalse(configs.isEmpty());
    Map<String, MediaTypeConfigData> byValue = new Map<String, MediaTypeConfigData>();
    for (MediaTypeConfigData config : configs) {
      byValue.put(config.value, config);
    }
    Assert.isTrue(byValue.containsKey('Anime'));
    Assert.isTrue(byValue.get('Anime').tracksProgress);
    Assert.areEqual('Episodes', byValue.get('Anime').progressUnit);
    Assert.isFalse(byValue.get('Movie').tracksProgress);

    for (Integer i = 1; i < configs.size(); i++) {
      Assert.isTrue(
        configs[i - 1].sortOrder <= configs[i].sortOrder,
        'Configs are sorted'
      );
    }
  }
}

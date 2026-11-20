@IsTest
private class MediaCollectionServiceTest {
  /*
   * MCU (Cinematic Universe)
   *  └─ Infinity Saga (Phase)
   *       ├─ Iron Man           #1  Completed  English
   *       └─ The Avengers       #6  In Progress
   *  Loki (TV, directly in MCU)     Planned    English
   * Dhoom (Series)
   *       └─ Dhoom 2            #2  Completed  Hindi
   * Arrival (no collection)
   */
  @TestSetup
  static void setup() {
    User u = MediaTestDataFactory.createTrackerUser();
    System.runAs(u) {
      Media_Collection__c mcu = new Media_Collection__c(
        Name = 'Marvel Cinematic Universe',
        Collection_Type__c = 'Cinematic Universe'
      );
      Media_Collection__c dhoom = new Media_Collection__c(
        Name = 'Dhoom',
        Collection_Type__c = 'Series'
      );
      insert new List<Media_Collection__c>{ mcu, dhoom };
      Media_Collection__c saga = new Media_Collection__c(
        Name = 'Infinity Saga',
        Collection_Type__c = 'Phase',
        Parent_Collection__c = mcu.Id
      );
      insert saga;

      Media_Item__c ironMan = item(
        'Iron Man',
        'Movie',
        'Completed',
        saga.Id,
        1
      );
      ironMan.Language__c = 'English';
      ironMan.Release_Year__c = 2008;
      Media_Item__c avengers = item(
        'The Avengers',
        'Movie',
        'In Progress',
        saga.Id,
        6
      );
      avengers.Release_Year__c = 2012;
      Media_Item__c loki = item('Loki', 'TV Series', 'Planned', mcu.Id, null);
      loki.Language__c = 'English';
      Media_Item__c dhoom2 = item('Dhoom 2', 'Movie', 'Completed', dhoom.Id, 2);
      dhoom2.Language__c = 'Hindi';
      Media_Item__c arrival = item('Arrival', 'Movie', 'Planned', null, null);
      insert new List<Media_Item__c>{
        ironMan,
        avengers,
        loki,
        dhoom2,
        arrival
      };
    }
  }

  private static Media_Item__c item(
    String title,
    String mediaType,
    String status,
    Id collectionId,
    Integer order
  ) {
    Media_Item__c rec = MediaTestDataFactory.buildItem(
      title,
      mediaType,
      status
    );
    rec.Collection__c = collectionId;
    rec.Collection_Order__c = order;
    return rec;
  }

  private static Id collectionId(String name) {
    return [SELECT Id FROM Media_Collection__c WHERE Name = :name LIMIT 1].Id;
  }

  private static Map<String, MediaCollectionData> byName(
    List<MediaCollectionData> collections
  ) {
    Map<String, MediaCollectionData> result = new Map<String, MediaCollectionData>();
    for (MediaCollectionData c : collections) {
      result.put(c.name, c);
    }
    return result;
  }

  @IsTest
  static void collectionsComeInTreeOrderWithRolledUpCounts() {
    List<MediaCollectionData> collections;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Test.startTest();
      collections = MediaCollectionService.getCollections();
      Test.stopTest();
    }

    Assert.areEqual(3, collections.size());
    Assert.areEqual('Dhoom', collections[0].name, 'Top level sorted by name');
    Assert.areEqual('Marvel Cinematic Universe', collections[1].name);
    Assert.areEqual(
      'Infinity Saga',
      collections[2].name,
      'Sub-collection right after its parent'
    );

    MediaCollectionData saga = collections[2];
    Assert.areEqual(1, saga.depth);
    Assert.areEqual('Marvel Cinematic Universe › Infinity Saga', saga.path);
    Assert.areEqual('Marvel Cinematic Universe', saga.parentName);
    Assert.areEqual(2, saga.itemCount);
    Assert.areEqual(1, saga.completedCount);

    MediaCollectionData mcu = collections[1];
    Assert.areEqual(0, mcu.depth);
    Assert.areEqual(3, mcu.itemCount, 'Loki + the two Infinity Saga films');
    Assert.areEqual(1, mcu.completedCount);
    Assert.areEqual(1, collections[0].itemCount);
  }

  @IsTest
  static void filteringByCollectionIncludesSubCollections() {
    Id mcuId = collectionId('Marvel Cinematic Universe');
    MediaPageData withChildren;
    MediaPageData directOnly;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaFilterData filter = new MediaFilterData();
      filter.collectionIds = new List<Id>{ mcuId };
      filter.sortBy = 'collectionOrder';
      filter.sortDirection = 'ASC';
      withChildren = MediaItemService.getMediaPage(filter);

      MediaFilterData direct = new MediaFilterData();
      direct.collectionIds = new List<Id>{ mcuId };
      direct.includeSubCollections = false;
      directOnly = MediaItemService.getMediaPage(direct);
    }

    Assert.areEqual(3, withChildren.totalCount);
    // Infinity Saga (#1, #6) sorts before Marvel Cinematic Universe (Loki).
    Assert.areEqual('Iron Man', withChildren.items[0].title);
    Assert.areEqual('The Avengers', withChildren.items[1].title);
    Assert.areEqual('Loki', withChildren.items[2].title);
    Assert.areEqual('Infinity Saga', withChildren.items[0].collectionName);
    Assert.areEqual(1, withChildren.items[0].collectionOrder);

    Assert.areEqual(1, directOnly.totalCount);
    Assert.areEqual('Loki', directOnly.items[0].title);
  }

  @IsTest
  static void filtersByLanguageAndSearchesCollectionNames() {
    MediaPageData hindi;
    MediaPageData search;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaFilterData byLanguage = new MediaFilterData();
      byLanguage.languages = new List<String>{ 'Hindi' };
      hindi = MediaItemService.getMediaPage(byLanguage);

      MediaFilterData bySearch = new MediaFilterData();
      bySearch.searchTerm = 'Infinity';
      search = MediaItemService.getMediaPage(bySearch);
    }

    Assert.areEqual(1, hindi.totalCount);
    Assert.areEqual('Dhoom 2', hindi.items[0].title);
    Assert.areEqual('Hindi', hindi.items[0].language);
    Assert.areEqual(
      2,
      search.totalCount,
      'Search matches the collection name too'
    );
  }

  @IsTest
  static void savesItemIntoCollectionAndClearsOrderWithoutOne() {
    Id dhoomId = collectionId('Dhoom');
    MediaItemData saved;
    MediaItemData moved;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData input = MediaTestDataFactory.buildData(
        'Dhoom 3',
        'Movie',
        null
      );
      input.collectionId = dhoomId;
      input.collectionOrder = 3;
      input.language = 'Hindi';
      saved = MediaItemService.saveMediaItem(input);

      saved.collectionId = null; // order is meaningless outside a collection
      moved = MediaItemService.saveMediaItem(saved);
    }

    Assert.areEqual('Dhoom', saved.collectionName);
    Assert.areEqual(3, saved.collectionOrder);
    Assert.areEqual('Hindi', saved.language);
    Assert.isNull(moved.collectionId);
    Assert.isNull(moved.collectionOrder);
  }

  @IsTest
  static void cannotUseAnotherUsersCollection() {
    User other = MediaTestDataFactory.createTrackerUser('MediaOtherOwner');
    Id mcuId = collectionId('Marvel Cinematic Universe');
    System.runAs(other) {
      MediaItemData input = MediaTestDataFactory.buildData(
        'Thor',
        'Movie',
        null
      );
      input.collectionId = mcuId;
      try {
        MediaItemService.saveMediaItem(input);
        Assert.fail('Expected an exception');
      } catch (MediaCollectionService.MediaCollectionException e) {
        Assert.isTrue(e.getMessage().contains('not found'));
      }
      Assert.isTrue(
        MediaCollectionService.getCollections().isEmpty(),
        'Other users never see my collections'
      );
    }
  }

  @IsTest
  static void createsAndUpdatesCollections() {
    Id mcuId = collectionId('Marvel Cinematic Universe');
    MediaCollectionData created;
    MediaCollectionData renamed;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaCollectionData input = new MediaCollectionData();
      input.name = '  Multiverse Saga ';
      input.collectionType = 'Phase';
      input.parentId = mcuId;
      created = MediaCollectionService.saveCollection(input);

      MediaCollectionData edit = new MediaCollectionData();
      edit.id = created.id;
      edit.name = 'The Multiverse Saga';
      edit.parentId = mcuId;
      renamed = MediaCollectionService.saveCollection(edit);
    }

    Assert.isNotNull(created.id);
    Assert.areEqual('Multiverse Saga', created.name, 'Name is trimmed');
    Assert.areEqual(
      'Marvel Cinematic Universe › Multiverse Saga',
      created.path
    );
    Assert.areEqual(created.id, renamed.id);
    Assert.areEqual('The Multiverse Saga', renamed.name);
  }

  @IsTest
  static void rejectsInvalidCollections() {
    Id mcuId = collectionId('Marvel Cinematic Universe');
    Id sagaId = collectionId('Infinity Saga');
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaCollectionData mcu = MediaCollectionService.getCollections()[1];
      Assert.areEqual(mcuId, mcu.id);

      mcu.parentId = sagaId; // MCU inside its own sub-collection
      assertRejected(mcu, 'inside itself');

      mcu.parentId = mcuId; // MCU inside itself
      assertRejected(mcu, 'inside itself');

      assertRejected(null, 'No collection');
      assertRejected(new MediaCollectionData(), 'name is required');

      try {
        MediaCollectionService.deleteCollection(null);
        Assert.fail('Expected an exception');
      } catch (MediaCollectionService.MediaCollectionException e) {
        Assert.isTrue(e.getMessage().contains('required'));
      }
    }
  }

  private static void assertRejected(
    MediaCollectionData input,
    String expectedMessage
  ) {
    try {
      MediaCollectionService.saveCollection(input);
      Assert.fail('Expected an exception');
    } catch (MediaCollectionService.MediaCollectionException e) {
      Assert.isTrue(e.getMessage().contains(expectedMessage), e.getMessage());
    }
  }

  @IsTest
  static void deletingACollectionKeepsItsItemsAndSubCollections() {
    Id mcuId = collectionId('Marvel Cinematic Universe');
    List<MediaCollectionData> after;
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Test.startTest();
      MediaCollectionService.deleteCollection(mcuId);
      Test.stopTest();
      after = MediaCollectionService.getCollections();
    }

    Map<String, MediaCollectionData> collections = byName(after);
    Assert.isFalse(collections.containsKey('Marvel Cinematic Universe'));
    MediaCollectionData saga = collections.get('Infinity Saga');
    Assert.areEqual(0, saga.depth, 'Sub-collection moved to the top level');
    Assert.isNull(saga.parentId);

    Media_Item__c loki = [
      SELECT Collection__c
      FROM Media_Item__c
      WHERE Name = 'Loki'
    ];
    Assert.isNull(loki.Collection__c, 'Item kept, just left the collection');
  }

  @IsTest
  static void controllerExposesCollections() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      Assert.areEqual(3, MediaTrackerController.getCollections().size());

      MediaCollectionData input = new MediaCollectionData();
      input.name = 'DC Universe';
      input.collectionType = 'Cinematic Universe';
      MediaCollectionData saved = MediaTrackerController.saveCollection(input);
      Assert.isNotNull(saved.id);

      MediaTrackerController.deleteCollection(saved.id);
      Assert.areEqual(3, MediaTrackerController.getCollections().size());

      try {
        MediaTrackerController.saveCollection(new MediaCollectionData());
        Assert.fail('Expected an AuraHandledException');
      } catch (AuraHandledException e) {
        Assert.areEqual('Collection name is required.', e.getMessage());
      }
      try {
        MediaTrackerController.deleteCollection(null);
        Assert.fail('Expected an AuraHandledException');
      } catch (AuraHandledException e) {
        Assert.areEqual('A collection Id is required.', e.getMessage());
      }
    }
  }
}

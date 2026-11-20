@IsTest
private class MediaItemSelectorTest {
  @IsTest
  static void filterNormalizationClampsValues() {
    MediaFilterData filter = new MediaFilterData();
    filter.searchTerm = '   ';
    filter.mediaTypes = new List<String>{ 'Anime', '', null, ' Movie ' };
    filter.sortDirection = 'sideways';
    filter.pageSize = 100000;
    filter.pageOffset = -4;

    filter.normalize();

    Assert.isNull(filter.searchTerm);
    Assert.areEqual(new List<String>{ 'Anime', 'Movie' }, filter.mediaTypes);
    Assert.areEqual(0, filter.statuses.size());
    Assert.isFalse(filter.favoritesOnly);
    Assert.areEqual('DESC', filter.sortDirection);
    Assert.areEqual(MediaFilterData.MAX_PAGE_SIZE, filter.pageSize);
    Assert.areEqual(0, filter.pageOffset);
    Assert.areEqual(MediaFilterData.DEFAULT_SORT, filter.sortBy);
  }

  @IsTest
  static void orderByOnlyUsesWhitelistedFields() {
    MediaFilterData filter = new MediaFilterData();
    filter.sortBy = 'Name; DELETE';
    filter.normalize();

    String orderBy = MediaItemSelector.buildOrderBy(filter);

    Assert.areEqual(
      ' ORDER BY LastModifiedDate DESC NULLS LAST, Id ASC',
      orderBy
    );
  }

  @IsTest
  static void whereClauseUsesBindsForUserInput() {
    MediaFilterData filter = new MediaFilterData();
    filter.searchTerm = 'x\' OR Name != \'';
    filter.statuses = new List<String>{ 'Completed' };
    filter.favoritesOnly = true;
    filter.normalize();
    Map<String, Object> binds = new Map<String, Object>();

    String whereClause = MediaItemSelector.buildWhereClause(filter, binds);

    Assert.isFalse(
      whereClause.contains('OR Name !='),
      'Search text must not be concatenated'
    );
    Assert.areEqual('%' + filter.searchTerm + '%', binds.get('searchLike'));
    Assert.areEqual(UserInfo.getUserId(), binds.get('ownerId'));
    Assert.isTrue(whereClause.contains('Is_Favorite__c = true'));
    Assert.isTrue(whereClause.contains('Status__c IN :statuses'));
  }

  @IsTest
  static void filtersByLanguageAndCollection() {
    Id fakeCollectionId =
      Media_Collection__c.SObjectType.getDescribe().getKeyPrefix() +
      '000000000001';
    MediaFilterData filter = new MediaFilterData();
    filter.languages = new List<String>{ ' Hindi ', '' };
    filter.collectionIds = new List<Id>{
      fakeCollectionId,
      null,
      fakeCollectionId
    };
    filter.normalize();
    Map<String, Object> binds = new Map<String, Object>();

    String whereClause = MediaItemSelector.buildWhereClause(filter, binds);

    Assert.isTrue(whereClause.contains('Language__c IN :languages'));
    Assert.isTrue(whereClause.contains('Collection__c IN :collectionIds'));
    Assert.areEqual(new List<String>{ 'Hindi' }, binds.get('languages'));
    Assert.areEqual(
      new List<Id>{ fakeCollectionId },
      binds.get('collectionIds'),
      'Blank and duplicate ids are dropped'
    );
    Assert.isTrue(filter.includeSubCollections, 'Defaults to true');
  }

  @IsTest
  static void collectionOrderSortsByEveryField() {
    MediaFilterData filter = new MediaFilterData();
    filter.sortBy = 'collectionOrder';
    filter.sortDirection = 'ASC';
    filter.normalize();

    Assert.areEqual(
      ' ORDER BY Collection__r.Name ASC NULLS LAST, Collection_Order__c ASC NULLS LAST, Release_Year__c ASC NULLS LAST, Id ASC',
      MediaItemSelector.buildOrderBy(filter)
    );
  }

  @IsTest
  static void selectsOnlyOwnRecords() {
    User owner = MediaTestDataFactory.createTrackerUser('MediaOwner');
    User otherUser = MediaTestDataFactory.createTrackerUser('MediaOther');
    MediaItemSelector selector = new MediaItemSelector();
    Media_Item__c mine = MediaTestDataFactory.buildItem(
      'Mine',
      'Movie',
      'Planned'
    );

    System.runAs(owner) {
      insert mine;
      Assert.areEqual('Mine', selector.selectById(mine.Id).Name);
      Assert.isTrue(selector.selectByIds(null).isEmpty());
    }

    System.runAs(otherUser) {
      Assert.isNull(
        selector.selectById(mine.Id),
        'Other users never see my items'
      );
    }
  }

  @IsTest
  static void rejectsUnknownGroupField() {
    MediaFilterData filter = new MediaFilterData().normalize();
    try {
      new MediaItemSelector().selectCountsGroupedBy('Name', filter);
      Assert.fail('Expected IllegalArgumentException');
    } catch (IllegalArgumentException e) {
      Assert.isTrue(e.getMessage().contains('Name'));
    }
  }

  @IsTest
  static void typeConfigSelectorReturnsDeployedRecords() {
    Map<String, Media_Type_Config__mdt> configs = new MediaTypeConfigSelector()
      .selectAllByMediaType();
    Assert.isTrue(
      configs.containsKey('Movie'),
      'Expected the shipped Movie config'
    );
  }
}

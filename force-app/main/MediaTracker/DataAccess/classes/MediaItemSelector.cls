/**
 * Selector for Media_Item__c. Every query against the object lives here.
 *
 * - All queries run in USER_MODE, so CRUD, FLS and sharing are enforced.
 * - Results are always scoped to the running user's own items.
 * - Dynamic parts (filters, sort) use bind variables or a whitelist,
 *   so user input never reaches the SOQL string.
 */
public inherited sharing class MediaItemSelector {
  @TestVisible
  private static final List<String> FIELDS = new List<String>{
    'Id',
    'Name',
    'Media_Type__c',
    'Status__c',
    'Rating__c',
    'Genre__c',
    'Platform__c',
    'Release_Year__c',
    'Progress_Current__c',
    'Progress_Total__c',
    'Start_Date__c',
    'Completed_Date__c',
    'Is_Favorite__c',
    'Poster_URL__c',
    'Notes__c',
    'Language__c',
    'Collection__c',
    'Collection__r.Name',
    'Collection_Order__c',
    'LastModifiedDate'
  };

  /** Child seasons and movies, ordered, so each item arrives with them in one query. */
  @TestVisible
  private static final String SEASON_SUBQUERY = '(SELECT Id, Name, Entry_Type__c, Season_Number__c, Episode_Count__c, Episodes_Watched__c, Aired_Date__c, Completed_Date__c FROM Media_Seasons__r ORDER BY Season_Number__c ASC)';

  private static String selectClause() {
    return 'SELECT ' + String.join(FIELDS, ', ') + ', ' + SEASON_SUBQUERY;
  }

  /**
   * UI sort key -> SOQL field(s). Anything not in this map falls back to the
   * default sort. Comma-separated fields all get the chosen direction.
   */
  @TestVisible
  private static final Map<String, String> SORTABLE_FIELDS = new Map<String, String>{
    'title' => 'Name',
    'rating' => 'Rating__c',
    'releaseYear' => 'Release_Year__c',
    'progress' => 'Progress_Percent__c',
    'mediaType' => 'Media_Type__c',
    'status' => 'Status__c',
    // Groups items by collection, then in collection order (release year breaks ties).
    'collectionOrder' => 'Collection__r.Name,Collection_Order__c,Release_Year__c',
    'lastModified' => 'LastModifiedDate'
  };

  private static final Set<String> GROUPABLE_FIELDS = new Set<String>{
    'Status__c',
    'Media_Type__c'
  };

  public List<Media_Item__c> selectByIds(Set<Id> recordIds) {
    if (recordIds == null || recordIds.isEmpty()) {
      return new List<Media_Item__c>();
    }
    Map<String, Object> binds = new Map<String, Object>{
      'recordIds' => recordIds,
      'ownerId' => UserInfo.getUserId()
    };
    String soql =
      selectClause() +
      ' FROM Media_Item__c WHERE Id IN :recordIds AND OwnerId = :ownerId';
    return Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE);
  }

  /**
   * Minimal fields needed to recalculate progress from seasons. Not limited
   * to the running user's items: sharing (USER_MODE) decides, so an admin
   * editing someone's seasons still keeps that item's totals in sync.
   */
  public List<Media_Item__c> selectForProgressSync(Set<Id> recordIds) {
    if (recordIds == null || recordIds.isEmpty()) {
      return new List<Media_Item__c>();
    }
    return [
      SELECT
        Id,
        Status__c,
        Progress_Current__c,
        Progress_Total__c,
        Start_Date__c,
        Completed_Date__c
      FROM Media_Item__c
      WHERE Id IN :recordIds
      WITH USER_MODE
    ];
  }

  public Media_Item__c selectById(Id recordId) {
    List<Media_Item__c> records = selectByIds(new Set<Id>{ recordId });
    return records.isEmpty() ? null : records[0];
  }

  /** One page of items matching the (normalized) filter. */
  public List<Media_Item__c> selectByFilter(MediaFilterData filter) {
    Map<String, Object> binds = new Map<String, Object>();
    String soql =
      selectClause() +
      ' FROM Media_Item__c' +
      buildWhereClause(filter, binds) +
      buildOrderBy(filter) +
      ' LIMIT ' +
      filter.pageSize +
      ' OFFSET ' +
      filter.pageOffset;
    return Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE);
  }

  public Integer countByFilter(MediaFilterData filter) {
    Map<String, Object> binds = new Map<String, Object>();
    String soql =
      'SELECT COUNT() FROM Media_Item__c' + buildWhereClause(filter, binds);
    return Database.countQueryWithBinds(soql, binds, AccessLevel.USER_MODE);
  }

  /** Counts grouped by Status__c or Media_Type__c. Aliases: grp, cnt. */
  public List<AggregateResult> selectCountsGroupedBy(
    String groupField,
    MediaFilterData filter
  ) {
    if (!GROUPABLE_FIELDS.contains(groupField)) {
      throw new IllegalArgumentException('Cannot group by ' + groupField);
    }
    Map<String, Object> binds = new Map<String, Object>();
    String soql =
      'SELECT ' +
      groupField +
      ' grp, COUNT(Id) cnt FROM Media_Item__c' +
      buildWhereClause(filter, binds) +
      ' GROUP BY ' +
      groupField;
    return (List<AggregateResult>) Database.queryWithBinds(
      soql,
      binds,
      AccessLevel.USER_MODE
    );
  }

  /** Average rating across rated items matching the filter. Alias: avgRating. */
  public Decimal selectAverageRating(MediaFilterData filter) {
    Map<String, Object> binds = new Map<String, Object>();
    String soql =
      'SELECT AVG(Rating__c) avgRating FROM Media_Item__c' +
      buildWhereClause(filter, binds);
    List<AggregateResult> results = (List<AggregateResult>) Database.queryWithBinds(
      soql,
      binds,
      AccessLevel.USER_MODE
    );
    return results.isEmpty() ? null : (Decimal) results[0].get('avgRating');
  }

  /**
   * Item counts per collection and status, for the running user's items.
   * Aliases: coll, st, cnt.
   */
  public List<AggregateResult> selectCountsByCollectionAndStatus() {
    return [
      SELECT Collection__c coll, Status__c st, COUNT(Id) cnt
      FROM Media_Item__c
      WHERE OwnerId = :UserInfo.getUserId() AND Collection__c != NULL
      WITH USER_MODE
      GROUP BY Collection__c, Status__c
    ];
  }

  @TestVisible
  private static String buildWhereClause(
    MediaFilterData filter,
    Map<String, Object> binds
  ) {
    List<String> conditions = new List<String>{ 'OwnerId = :ownerId' };
    binds.put('ownerId', UserInfo.getUserId());

    if (!filter.mediaTypes.isEmpty()) {
      conditions.add('Media_Type__c IN :mediaTypes');
      binds.put('mediaTypes', filter.mediaTypes);
    }
    if (!filter.statuses.isEmpty()) {
      conditions.add('Status__c IN :statuses');
      binds.put('statuses', filter.statuses);
    }
    if (!filter.languages.isEmpty()) {
      conditions.add('Language__c IN :languages');
      binds.put('languages', filter.languages);
    }
    if (!filter.collectionIds.isEmpty()) {
      conditions.add('Collection__c IN :collectionIds');
      binds.put('collectionIds', filter.collectionIds);
    }
    if (filter.favoritesOnly) {
      conditions.add('Is_Favorite__c = true');
    }
    if (String.isNotBlank(filter.searchTerm)) {
      conditions.add(
        '(Name LIKE :searchLike OR Genre__c LIKE :searchLike OR Platform__c LIKE :searchLike OR Collection__r.Name LIKE :searchLike)'
      );
      binds.put('searchLike', '%' + filter.searchTerm + '%');
    }
    return ' WHERE ' + String.join(conditions, ' AND ');
  }

  @TestVisible
  private static String buildOrderBy(MediaFilterData filter) {
    String fields = SORTABLE_FIELDS.get(filter.sortBy) ??
      SORTABLE_FIELDS.get(MediaFilterData.DEFAULT_SORT);
    String direction = filter.sortDirection == 'ASC' ? 'ASC' : 'DESC';
    List<String> parts = new List<String>();
    for (String field : fields.split(',')) {
      parts.add(field + ' ' + direction + ' NULLS LAST');
    }
    // Id as tie-breaker keeps OFFSET paging stable.
    return ' ORDER BY ' + String.join(parts, ', ') + ', Id ASC';
  }
}

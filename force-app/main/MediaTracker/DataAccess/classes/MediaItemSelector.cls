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
    'LastModifiedDate'
  };

  /** Child seasons, ordered, so each item arrives with its seasons in one query. */
  @TestVisible
  private static final String SEASON_SUBQUERY = '(SELECT Id, Name, Season_Number__c, Episode_Count__c, Episodes_Watched__c FROM Media_Seasons__r ORDER BY Season_Number__c ASC)';

  private static String selectClause() {
    return 'SELECT ' + String.join(FIELDS, ', ') + ', ' + SEASON_SUBQUERY;
  }

  /** UI sort key -> SOQL field. Anything not in this map falls back to the default sort. */
  @TestVisible
  private static final Map<String, String> SORTABLE_FIELDS = new Map<String, String>{
    'title' => 'Name',
    'rating' => 'Rating__c',
    'releaseYear' => 'Release_Year__c',
    'progress' => 'Progress_Percent__c',
    'mediaType' => 'Media_Type__c',
    'status' => 'Status__c',
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
    if (filter.favoritesOnly) {
      conditions.add('Is_Favorite__c = true');
    }
    if (String.isNotBlank(filter.searchTerm)) {
      conditions.add(
        '(Name LIKE :searchLike OR Genre__c LIKE :searchLike OR Platform__c LIKE :searchLike)'
      );
      binds.put('searchLike', '%' + filter.searchTerm + '%');
    }
    return ' WHERE ' + String.join(conditions, ' AND ');
  }

  @TestVisible
  private static String buildOrderBy(MediaFilterData filter) {
    String field = SORTABLE_FIELDS.get(filter.sortBy) ??
      SORTABLE_FIELDS.get(MediaFilterData.DEFAULT_SORT);
    String direction = filter.sortDirection == 'ASC' ? 'ASC' : 'DESC';
    // Id as tie-breaker keeps OFFSET paging stable.
    return ' ORDER BY ' + field + ' ' + direction + ' NULLS LAST, Id ASC';
  }
}

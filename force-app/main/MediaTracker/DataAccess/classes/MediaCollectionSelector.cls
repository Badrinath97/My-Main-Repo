/**
 * Selector for Media_Collection__c. All queries run in USER_MODE and are
 * scoped to the running user's own collections, like their media items.
 */
public inherited sharing class MediaCollectionSelector {
  /** Generous upper bound; a personal library has far fewer collections. */
  public static final Integer MAX_COLLECTIONS = 2000;

  /** All of the running user's collections, ordered by name. */
  public List<Media_Collection__c> selectAll() {
    return [
      SELECT
        Id,
        Name,
        Collection_Type__c,
        Parent_Collection__c,
        Parent_Collection__r.Name,
        Description__c,
        Poster_URL__c
      FROM Media_Collection__c
      WHERE OwnerId = :UserInfo.getUserId()
      WITH USER_MODE
      ORDER BY Name ASC
      LIMIT :MAX_COLLECTIONS
    ];
  }

  /** One of the running user's collections, or null if missing or not theirs. */
  public Media_Collection__c selectById(Id recordId) {
    if (recordId == null) {
      return null;
    }
    List<Media_Collection__c> records = [
      SELECT
        Id,
        Name,
        Collection_Type__c,
        Parent_Collection__c,
        Parent_Collection__r.Name,
        Description__c,
        Poster_URL__c
      FROM Media_Collection__c
      WHERE Id = :recordId AND OwnerId = :UserInfo.getUserId()
      WITH USER_MODE
      LIMIT 1
    ];
    return records.isEmpty() ? null : records[0];
  }
}

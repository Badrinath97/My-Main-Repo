/**
 * Selector for Media_Season__c. All queries run in USER_MODE; access to a
 * season follows access to its parent Media_Item__c (master-detail).
 */
public inherited sharing class MediaSeasonSelector {
  /** Seasons of the given items, ordered by item then season number. */
  public List<Media_Season__c> selectByMediaItemIds(Set<Id> mediaItemIds) {
    if (mediaItemIds == null || mediaItemIds.isEmpty()) {
      return new List<Media_Season__c>();
    }
    return [
      SELECT
        Id,
        Name,
        Entry_Type__c,
        Media_Item__c,
        Season_Number__c,
        Episode_Count__c,
        Episodes_Watched__c,
        Aired_Date__c,
        Completed_Date__c
      FROM Media_Season__c
      WHERE Media_Item__c IN :mediaItemIds
      WITH USER_MODE
      ORDER BY Media_Item__c, Season_Number__c ASC
    ];
  }

  /** Same as selectByMediaItemIds, grouped by parent item Id. */
  public Map<Id, List<Media_Season__c>> selectGroupedByMediaItem(
    Set<Id> mediaItemIds
  ) {
    Map<Id, List<Media_Season__c>> grouped = new Map<Id, List<Media_Season__c>>();
    for (Media_Season__c season : selectByMediaItemIds(mediaItemIds)) {
      if (!grouped.containsKey(season.Media_Item__c)) {
        grouped.put(season.Media_Item__c, new List<Media_Season__c>());
      }
      grouped.get(season.Media_Item__c).add(season);
    }
    return grouped;
  }
}

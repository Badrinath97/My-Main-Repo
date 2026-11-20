/**
 * Selector for Media_Type_Config__mdt.
 * Custom metadata queries do not count against SOQL governor limits.
 */
public inherited sharing class MediaTypeConfigSelector {
  /** All config records keyed by their Media_Type__c value (active and inactive). */
  public Map<String, Media_Type_Config__mdt> selectAllByMediaType() {
    Map<String, Media_Type_Config__mdt> result = new Map<String, Media_Type_Config__mdt>();
    for (Media_Type_Config__mdt config : [
      SELECT
        DeveloperName,
        Media_Type__c,
        Progress_Unit__c,
        Tracks_Progress__c,
        Tracks_Seasons__c,
        Tracks_Movies__c,
        Hidden_Form_Fields__c,
        Extra_Form_Fields__c,
        Icon_Name__c,
        Sort_Order__c,
        Is_Active__c
      FROM Media_Type_Config__mdt
      ORDER BY Sort_Order__c ASC NULLS LAST
    ]) {
      result.put(config.Media_Type__c, config);
    }
    return result;
  }
}

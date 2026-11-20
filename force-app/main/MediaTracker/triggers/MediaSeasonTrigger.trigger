/**
 * Keeps each Media_Item__c's progress in sync with its seasons, whatever
 * changed them (the tracker UI, the record page, Data Loader, flows...).
 * No logic here: everything lives in MediaSeasonService.
 */
trigger MediaSeasonTrigger on Media_Season__c(
  after insert,
  after update,
  after delete,
  after undelete
) {
  MediaSeasonService.syncFromSeasons(
    Trigger.isDelete ? Trigger.old : Trigger.new
  );
}

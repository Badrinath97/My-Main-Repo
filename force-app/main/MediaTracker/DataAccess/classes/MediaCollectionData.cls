/**
 * Data class (DTO) for a collection: a franchise, cinematic universe, film
 * series or phase that groups media items (e.g. Marvel Cinematic Universe).
 *
 * Collections can be nested (Infinity Saga inside MCU). The service fills in
 * path, depth and the item counts, which include every sub-collection.
 */
public class MediaCollectionData {
  public static final String PATH_SEPARATOR = ' › ';

  @AuraEnabled
  public Id id { get; set; }
  @AuraEnabled
  public String name { get; set; }
  @AuraEnabled
  public String collectionType { get; set; }
  @AuraEnabled
  public Id parentId { get; set; }
  @AuraEnabled
  public String parentName { get; set; }
  @AuraEnabled
  public String description { get; set; }
  @AuraEnabled
  public String posterUrl { get; set; }

  // ---- calculated by MediaCollectionService (ignored when saving)
  /** Full name including ancestors, e.g. "MCU › Infinity Saga". */
  @AuraEnabled
  public String path { get; set; }
  /** 0 for a top-level collection, 1 for its sub-collections, ... */
  @AuraEnabled
  public Integer depth { get; set; }
  /** Items in this collection and all of its sub-collections. */
  @AuraEnabled
  public Integer itemCount { get; set; }
  /** Completed items in this collection and all of its sub-collections. */
  @AuraEnabled
  public Integer completedCount { get; set; }

  public MediaCollectionData() {
    this.depth = 0;
    this.itemCount = 0;
    this.completedCount = 0;
  }

  public MediaCollectionData(Media_Collection__c rec) {
    this();
    this.id = rec.Id;
    this.name = rec.Name;
    this.collectionType = rec.Collection_Type__c;
    this.parentId = rec.Parent_Collection__c;
    this.parentName = rec.Parent_Collection__r?.Name;
    this.description = rec.Description__c;
    this.posterUrl = rec.Poster_URL__c;
    this.path = rec.Name;
  }

  /** Maps the DTO back to an SObject ready for DML (Id included when present). */
  public Media_Collection__c toRecord() {
    return new Media_Collection__c(
      Id = this.id,
      Name = this.name?.trim(),
      Collection_Type__c = this.collectionType,
      Parent_Collection__c = this.parentId,
      Description__c = this.description,
      Poster_URL__c = this.posterUrl
    );
  }
}

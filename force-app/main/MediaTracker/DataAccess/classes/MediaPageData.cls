/**
 * Data class for one page of results plus the paging info the UI needs.
 */
public class MediaPageData {
  @AuraEnabled
  public List<MediaItemData> items { get; set; }
  @AuraEnabled
  public Integer totalCount { get; set; }
  @AuraEnabled
  public Boolean hasMore { get; set; }

  public MediaPageData(
    List<MediaItemData> items,
    Integer totalCount,
    Integer pageOffset
  ) {
    this.items = items;
    this.totalCount = totalCount;
    this.hasMore =
      pageOffset + items.size() < totalCount &&
      pageOffset + items.size() < MediaFilterData.MAX_OFFSET;
  }
}

/**
 * Data class describing what the user wants to see: search, filters,
 * sorting and paging. Always call normalize() before handing it to a
 * selector - it clamps every value to a safe range.
 */
public class MediaFilterData {
  public static final Integer DEFAULT_PAGE_SIZE = 12;
  public static final Integer MAX_PAGE_SIZE = 200;
  public static final Integer MAX_OFFSET = 2000; // SOQL OFFSET hard limit
  public static final String DEFAULT_SORT = 'lastModified';

  @AuraEnabled
  public String searchTerm { get; set; }
  @AuraEnabled
  public List<String> mediaTypes { get; set; }
  @AuraEnabled
  public List<String> statuses { get; set; }
  @AuraEnabled
  public Boolean favoritesOnly { get; set; }
  @AuraEnabled
  public String sortBy { get; set; }
  @AuraEnabled
  public String sortDirection { get; set; }
  @AuraEnabled
  public Integer pageSize { get; set; }
  @AuraEnabled
  public Integer pageOffset { get; set; }

  public MediaFilterData normalize() {
    this.searchTerm = String.isBlank(this.searchTerm)
      ? null
      : this.searchTerm.trim().left(100);
    this.mediaTypes = cleanList(this.mediaTypes);
    this.statuses = cleanList(this.statuses);
    this.favoritesOnly = this.favoritesOnly == true;
    this.sortBy = String.isBlank(this.sortBy) ? DEFAULT_SORT : this.sortBy;
    this.sortDirection = 'ASC'.equalsIgnoreCase(this.sortDirection)
      ? 'ASC'
      : 'DESC';
    this.pageSize = (this.pageSize == null ||
      this.pageSize < 1)
      ? DEFAULT_PAGE_SIZE
      : Math.min(this.pageSize, MAX_PAGE_SIZE);
    this.pageOffset = (this.pageOffset == null ||
      this.pageOffset < 0)
      ? 0
      : Math.min(this.pageOffset, MAX_OFFSET);
    return this;
  }

  private static List<String> cleanList(List<String> values) {
    List<String> cleaned = new List<String>();
    if (values == null) {
      return cleaned;
    }
    for (String value : values) {
      if (String.isNotBlank(value)) {
        cleaned.add(value.trim());
      }
    }
    return cleaned;
  }
}

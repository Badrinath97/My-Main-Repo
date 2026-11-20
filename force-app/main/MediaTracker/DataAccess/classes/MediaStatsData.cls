/**
 * Data class with summary statistics for the current user's library.
 */
public class MediaStatsData {
  @AuraEnabled
  public Integer total { get; set; }
  @AuraEnabled
  public Integer favorites { get; set; }
  @AuraEnabled
  public Decimal averageRating { get; set; }
  @AuraEnabled
  public List<Bucket> byStatus { get; set; }
  @AuraEnabled
  public List<Bucket> byType { get; set; }

  public MediaStatsData() {
    this.total = 0;
    this.favorites = 0;
    this.byStatus = new List<Bucket>();
    this.byType = new List<Bucket>();
  }

  /** A labelled count, e.g. { value: 'Completed', label: 'Completed', count: 12 }. */
  public class Bucket {
    @AuraEnabled
    public String value { get; set; }
    @AuraEnabled
    public String label { get; set; }
    @AuraEnabled
    public Integer count { get; set; }

    public Bucket(String value, String label, Integer count) {
      this.value = value;
      this.label = label;
      this.count = count;
    }
  }
}

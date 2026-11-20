/**
 * Service for collections: franchises, cinematic universes, film series and
 * phases that group media items (e.g. MCU › Infinity Saga › Iron Man).
 *
 * Collections form a tree through Parent_Collection__c. This class owns the
 * tree rules (no cycles, counts roll up to ancestors, filtering a collection
 * includes its sub-collections). It contains no SOQL.
 */
public with sharing class MediaCollectionService {
  @TestVisible
  private static MediaCollectionSelector collectionSelector = new MediaCollectionSelector();
  @TestVisible
  private static MediaItemSelector itemSelector = new MediaItemSelector();

  public class MediaCollectionException extends Exception {
  }

  // ------------------------------------------------------------------ reads

  /**
   * The running user's collections in tree order: each collection is
   * followed by its sub-collections, siblings sorted by name. Counts include
   * items of every sub-collection.
   */
  public static List<MediaCollectionData> getCollections() {
    Tree tree = new Tree(collectionSelector.selectAll());

    for (
      AggregateResult ar : itemSelector.selectCountsByCollectionAndStatus()
    ) {
      MediaCollectionData node = tree.byId.get((Id) ar.get('coll'));
      if (node == null) {
        continue;
      }
      Integer count = (Integer) ar.get('cnt');
      node.itemCount += count;
      if ((String) ar.get('st') == MediaItemService.STATUS_COMPLETED) {
        node.completedCount += count;
      }
    }
    return tree.ordered();
  }

  /** The given collections plus every collection nested anywhere below them. */
  public static Set<Id> expandWithDescendants(Set<Id> collectionIds) {
    Set<Id> result = new Set<Id>();
    if (collectionIds == null || collectionIds.isEmpty()) {
      return result;
    }
    Tree tree = new Tree(collectionSelector.selectAll());
    List<Id> queue = new List<Id>(collectionIds);
    while (!queue.isEmpty()) {
      Id current = queue.remove(queue.size() - 1);
      if (current == null || !result.add(current)) {
        continue; // already seen: also protects against cycles
      }
      for (MediaCollectionData child : tree.childrenOf(current)) {
        queue.add(child.id);
      }
    }
    return result;
  }

  // ----------------------------------------------------------------- writes

  public static MediaCollectionData saveCollection(
    MediaCollectionData collection
  ) {
    if (collection == null) {
      throw new MediaCollectionException('No collection was provided.');
    }
    if (String.isBlank(collection.name)) {
      throw new MediaCollectionException('Collection name is required.');
    }
    if (collection.id != null) {
      requireCollection(collection.id); // ownership check
    }
    if (collection.parentId != null) {
      requireCollection(collection.parentId);
      if (
        collection.id != null &&
        expandWithDescendants(new Set<Id>{ collection.id })
          .contains(collection.parentId)
      ) {
        throw new MediaCollectionException(
          'A collection can\'t be placed inside itself or one of its own sub-collections.'
        );
      }
    }

    Media_Collection__c rec = collection.toRecord();
    upsert as user rec;
    return getCollection(rec.Id);
  }

  /**
   * Deletes a collection. Its items are kept (they just leave the
   * collection) and its sub-collections move up to the top level.
   */
  public static void deleteCollection(Id collectionId) {
    delete as user requireCollection(collectionId);
  }

  // ---------------------------------------------------------------- helpers

  /** Throws unless the collection exists and belongs to the running user. */
  public static Media_Collection__c requireCollection(Id collectionId) {
    if (collectionId == null) {
      throw new MediaCollectionException('A collection Id is required.');
    }
    Media_Collection__c rec = collectionSelector.selectById(collectionId);
    if (rec == null) {
      throw new MediaCollectionException(
        'Collection not found or you do not have access to it.'
      );
    }
    return rec;
  }

  private static MediaCollectionData getCollection(Id collectionId) {
    for (MediaCollectionData data : getCollections()) {
      if (data.id == collectionId) {
        return data;
      }
    }
    return new MediaCollectionData(requireCollection(collectionId));
  }

  /** In-memory tree of collections, built from one query. */
  private class Tree {
    public final Map<Id, MediaCollectionData> byId = new Map<Id, MediaCollectionData>();
    private final List<MediaCollectionData> all = new List<MediaCollectionData>();
    private final Map<Id, List<MediaCollectionData>> children = new Map<Id, List<MediaCollectionData>>();
    private final List<MediaCollectionData> roots = new List<MediaCollectionData>();

    /** records must be sorted by name; that order is kept for siblings. */
    public Tree(List<Media_Collection__c> records) {
      for (Media_Collection__c rec : records) {
        MediaCollectionData node = new MediaCollectionData(rec);
        byId.put(node.id, node);
        all.add(node); // keeps the name order (map order is not guaranteed)
      }
      for (MediaCollectionData node : all) {
        // A parent we can't see (or none) makes this a top-level collection.
        if (node.parentId == null || !byId.containsKey(node.parentId)) {
          roots.add(node);
        } else {
          childrenOf(node.parentId).add(node);
        }
      }
    }

    public List<MediaCollectionData> childrenOf(Id parentId) {
      if (!children.containsKey(parentId)) {
        children.put(parentId, new List<MediaCollectionData>());
      }
      return children.get(parentId);
    }

    /** Depth-first order with path, depth and rolled-up counts filled in. */
    public List<MediaCollectionData> ordered() {
      List<MediaCollectionData> result = new List<MediaCollectionData>();
      Set<Id> visited = new Set<Id>();
      for (MediaCollectionData root : roots) {
        visit(root, null, result, visited);
      }
      // Collections stuck in a cycle (only possible via data loads) have no
      // root; list them at the top level rather than hiding them.
      for (MediaCollectionData node : all) {
        if (!visited.contains(node.id)) {
          visit(node, null, result, visited);
        }
      }
      return result;
    }

    private void visit(
      MediaCollectionData node,
      MediaCollectionData parent,
      List<MediaCollectionData> result,
      Set<Id> visited
    ) {
      visited.add(node.id);
      node.depth = parent == null ? 0 : parent.depth + 1;
      node.path = parent == null
        ? node.name
        : parent.path + MediaCollectionData.PATH_SEPARATOR + node.name;
      result.add(node);
      for (MediaCollectionData child : childrenOf(node.id)) {
        if (visited.contains(child.id)) {
          continue;
        }
        visit(child, node, result, visited);
        node.itemCount += child.itemCount;
        node.completedCount += child.completedCount;
      }
    }
  }
}

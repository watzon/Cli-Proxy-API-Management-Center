import styles from './TagList.module.scss';

interface TagListProps {
  tags: readonly string[];
  /** Accessible name for the list, for example "Tags". */
  label: string;
  className?: string;
}

/** Read-only list of credential tags rendered as small badges. */
export function TagList({ tags, label, className = '' }: TagListProps) {
  if (tags.length === 0) return null;
  return (
    <ul className={`${styles.tagList} ${className}`.trim()} aria-label={label}>
      {tags.map((tag) => (
        <li key={tag} className={styles.tag}>
          {tag}
        </li>
      ))}
    </ul>
  );
}

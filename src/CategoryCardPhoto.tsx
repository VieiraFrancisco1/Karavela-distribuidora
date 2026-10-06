import type { CSSProperties } from 'react'
import MediaImage from './MediaImage'
import CategoryCardLabel from './CategoryCardLabel'

export default function CategoryCardPhoto({ src, label, style }: { src: string; label: string; style: CSSProperties }) {
  return <>
    <span className="category-card-image-frame">
      <MediaImage className="category-card-image" src={src} alt="" draggable={false} style={style}/>
    </span>
    <CategoryCardLabel label={label}/>
  </>
}

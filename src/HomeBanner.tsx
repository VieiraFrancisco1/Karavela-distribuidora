import { useEffect, useRef, useState } from 'react'

const slides = [
  { id: 'bebidas', image: '/assets/banners/bebidas.png', alt: 'Karavela: ligou, pediu, chegou! Bebidas geladas com entrega.', label: 'Ver bebidas do catálogo', destination: 'catalogo' },
  { id: 'brahma-caixa', image: '/assets/banners/brahma-caixa.png', alt: 'Engradado Brahma 300 ml: 23 garrafas por R$ 63,80.', label: 'Ver oferta de Brahma 300 ml em caixa', destination: 'brahma-caixa' },
  { id: 'cervejas', image: '/assets/banners/cervejas.png', alt: 'Cerveja gelada: a Karavela leva até você.', label: 'Ver cervejas long neck', destination: 'cervejas' },
] as const

export type BannerDestination = (typeof slides)[number]['destination']
const frames = [slides[slides.length - 1], ...slides, slides[0]]

export default function HomeBanner({ onCheck, paused = false }: { onCheck: (destination: BannerDestination) => void; paused?: boolean }) {
  const [position, setPosition] = useState(1)
  const [animate, setAnimate] = useState(true)
  const moving = useRef(false)
  const current = (position - 1 + slides.length) % slides.length

  function move(direction: number) {
    if (moving.current) return
    moving.current = true
    setAnimate(true)
    setPosition(previous => previous + direction)
  }

  useEffect(() => {
    if (paused) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      move(1)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [position, paused])

  function finishMove() {
    moving.current = false
    if (position === 0 || position === slides.length + 1) {
      setAnimate(false)
      setPosition(position === 0 ? slides.length : 1)
    }
  }

  return <section className="home-banner" aria-label="Ofertas Karavela" aria-roledescription="carrossel">
    <div className="home-banner-track" style={{ transform: `translateX(-${position * 100}%)`, transition: animate ? undefined : 'none' }} onTransitionEnd={event => { if (event.propertyName === 'transform') finishMove() }}>
      {frames.map((slide, index) => <button type="button" className={`home-banner-slide home-banner-slide--${slide.id}`} key={`${slide.id}-${index}`} aria-hidden={position !== index} tabIndex={position === index ? 0 : -1} aria-label={slide.label} onClick={() => onCheck(slide.destination)}>
        <img src={slide.image} alt={slide.alt} width="1536" height={slide.id === 'brahma-caixa' ? '512' : '864'} fetchPriority={index === 1 ? 'high' : 'auto'} draggable={false}/>
      </button>)}
    </div>
    <button type="button" className="home-banner-arrow home-banner-arrow--previous" aria-label="Banner anterior" onClick={() => move(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
    <button type="button" className="home-banner-arrow home-banner-arrow--next" aria-label="Próximo banner" onClick={() => move(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
    <div className="home-banner-position" aria-hidden="true">{slides.map((slide, index) => <span className={index === current ? 'is-current' : undefined} key={slide.id}/>)}</div>
  </section>
}

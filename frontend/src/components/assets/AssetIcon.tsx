import { useState } from 'react'

// Renders a logo image when one is available, falling back to the asset's
// type-based Lucide icon on missing URL or broken image. Uses the type's
// bg color as a tinted placeholder; switches to a white card + border when
// showing a real logo so brand colors don't clash with our palette.
export function AssetIcon({
  logoUrl,
  Icon,
  colorClass,
  bgClass,
  size = 20,
  tile = 'w-10 h-10',
}: {
  logoUrl: string | null | undefined
  Icon: React.ElementType
  colorClass: string
  bgClass: string
  size?: number
  tile?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImage = !!logoUrl && !errored
  return (
    <div
      className={`${tile} rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${
        showImage ? 'bg-white border border-border' : bgClass
      }`}
    >
      {showImage ? (
        <img
          src={logoUrl!}
          alt=""
          className="w-full h-full object-contain"
          onError={() => setErrored(true)}
        />
      ) : (
        <Icon size={size} className={colorClass} />
      )}
    </div>
  )
}

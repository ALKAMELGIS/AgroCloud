type Props = {
  iframeSrc: string
  iframeTitle: string
}

export default function JohnDeereMapEmbedFrame({ iframeSrc, iframeTitle }: Props) {
  return (
    <div className="gps-in-app-browser__frame-wrap">
      <iframe
        key={iframeSrc}
        title={iframeTitle}
        src={iframeSrc}
        allow="geolocation; clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  )
}

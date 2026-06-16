import { useCallback, useEffect, useRef, useState } from 'react'

/** Minimal Web Speech API surface (DOM lib typings vary by TS version). */
type SpeechRecError = { error?: string }
type SpeechRecResult = { isFinal: boolean; 0?: { transcript?: string } }
type SpeechRecEvent = { resultIndex: number; results: { length: number; [i: number]: SpeechRecResult } }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecEvent) => void) | null
  onerror: ((this: SpeechRecognitionLike, ev: SpeechRecError) => void) | null
  onend: ((this: SpeechRecognitionLike) => void) | null
}

type RecCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): RecCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** BCP-47 tag: Arabic vs English defaults from `navigator.language`. */
export function defaultGeoAiSpeechLang(): string {
  try {
    const loc = (navigator.language || 'en-US').trim()
    if (/^ar/i.test(loc)) return /^ar-[a-z]{2}/i.test(loc) ? loc : 'ar-SA'
    if (/^en/i.test(loc)) return /^en-[a-z]{2}/i.test(loc) ? loc : 'en-US'
    return 'en-US'
  } catch {
    return 'en-US'
  }
}

function mapSpeechErrorMessage(ev: SpeechRecError): string {
  const code = ev.error || ''
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied. Allow the microphone for this site in browser settings.'
    case 'no-speech':
      return 'No speech detected. Try again or speak closer to the microphone.'
    case 'audio-capture':
      return 'No microphone found or it is in use by another app.'
    case 'network':
      return 'Speech recognition network error. Check your connection and try again.'
    case 'aborted':
      return ''
    default:
      return code ? `Speech recognition error: ${code}` : 'Speech recognition failed.'
  }
}

export type UseGeoAiSpeechRecognitionOptions = {
  disabled: boolean
  onFinalTranscript: (text: string) => void
}

export function useGeoAiSpeechRecognition(options: UseGeoAiSpeechRecognitionOptions) {
  const { disabled, onFinalTranscript } = options
  const [supported] = useState(() => Boolean(getRecognitionCtor()))
  const [listening, setListening] = useState(false)
  /** Latest non-final transcript while recognition is running (UI: “capturing” vs idle mic). */
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<string>(() => defaultGeoAiSpeechLang())
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinalTranscript)
  onFinalRef.current = onFinalTranscript
  const finalsAccRef = useRef('')

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    recRef.current = null
    setListening(false)
    setInterimTranscript('')
  }, [])

  useEffect(() => () => stopListening(), [stopListening])

  useEffect(() => {
    if (disabled && listening) stopListening()
  }, [disabled, listening, stopListening])

  const cycleLang = useCallback(() => {
    setLang(prev => (prev.toLowerCase().startsWith('ar') ? 'en-US' : 'ar-SA'))
  }, [])

  const startListening = useCallback(() => {
    if (disabled) return
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('Voice input is not supported in this browser.')
      return
    }
    setError(null)
    setInterimTranscript('')
    try {
      recRef.current?.abort()
    } catch {
      /* ignore */
    }

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    finalsAccRef.current = ''

    rec.onresult = (event: SpeechRecEvent) => {
      let interim = ''
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i]
        if (!r.isFinal) interim += r[0]?.transcript ?? ''
      }
      setInterimTranscript(interim)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) finalsAccRef.current += r[0]?.transcript ?? ''
      }
    }

    rec.onerror = (ev: SpeechRecError) => {
      const msg = mapSpeechErrorMessage(ev)
      if (msg) setError(msg)
      setListening(false)
      setInterimTranscript('')
      recRef.current = null
      finalsAccRef.current = ''
    }

    rec.onend = () => {
      setListening(false)
      setInterimTranscript('')
      recRef.current = null
      const t = finalsAccRef.current.trim()
      finalsAccRef.current = ''
      if (t) onFinalRef.current(t)
    }

    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start speech recognition.')
      setListening(false)
      recRef.current = null
    }
  }, [disabled, lang])

  const clearError = useCallback(() => setError(null), [])

  return {
    supported,
    listening,
    interimTranscript,
    error,
    clearError,
    lang,
    setLang,
    cycleLang,
    startListening,
    stopListening,
  }
}

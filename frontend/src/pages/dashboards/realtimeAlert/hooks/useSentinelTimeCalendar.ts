import { useCallback, useMemo, useState } from 'react'
import { localIsoDate } from '../../../lib/siSentinelImageryDate'

export type SentinelCalendarDay = {
  date: string
  cloudPct: number | null
  hasData: boolean
}

export function useSentinelTimeCalendar(initialDate?: string) {
  const [analysisDate, setAnalysisDate] = useState(initialDate ?? localIsoDate())
  const [autoFollow, setAutoFollow] = useState(true)

  const calendarDays = useMemo((): SentinelCalendarDay[] => {
    const out: SentinelCalendarDay[] = []
    const base = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base)
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      out.push({
        date: iso,
        cloudPct: Math.round(Math.random() * 40),
        hasData: Math.random() > 0.15,
      })
    }
    return out
  }, [analysisDate])

  const pickDate = useCallback(
    (iso: string) => {
      setAnalysisDate(iso)
      setAutoFollow(false)
    },
    [],
  )

  const followToday = useCallback(() => {
    setAutoFollow(true)
    setAnalysisDate(localIsoDate())
  }, [])

  return { analysisDate, setAnalysisDate, autoFollow, setAutoFollow, calendarDays, pickDate, followToday }
}

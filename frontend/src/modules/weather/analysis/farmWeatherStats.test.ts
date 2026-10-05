import { describe, expect, it } from 'vitest'

import { computeFarmWeatherStats, farmWeatherStatsHasValues } from './farmWeatherStats'

import type { OpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'



describe('computeFarmWeatherStats', () => {

  it('returns null means when bundle is empty', () => {

    const stats = computeFarmWeatherStats(null)

    expect(stats.temperature.mean).toBeNull()

    expect(farmWeatherStatsHasValues(stats)).toBe(false)

  })



  it('falls back to daily and snapshot when hourly forecast slice is empty', () => {

    const bundle: OpenMeteoDashboardBundle = {

      snapshot: {

        lat: 24,

        lng: 54,

        timezone: 'Asia/Dubai',

        elevationM: 10,

        observedAt: '2026-10-05T12:00',

        temperatureC: 33,

        weatherCode: 0,

        conditionLabel: 'Clear',

        windSpeedKmh: 22,

        windDirectionDeg: 90,

        windDirectionLabel: 'E',

        humidityPct: 40,

        precipMm: 0,

        daily: [],

        nextHours: [],

      },

      hourly: [],

      hourlyForecast: [],

      daily7: [

        {

          date: '2026-10-05',

          tempMinC: 28,

          tempMaxC: 36,

          precipMm: 0.2,

          weatherCode: 0,

          conditionLabel: 'Clear',

        },

        {

          date: '2026-10-06',

          tempMinC: 27,

          tempMaxC: 35,

          precipMm: 1.1,

          weatherCode: 1,

          conditionLabel: 'Mainly clear',

        },

      ],

      fetchedAt: '2026-10-05T12:00:00Z',

      sourceLabel: 'Open-Meteo',

      resolutionLabel: 'test',

    }

    const stats = computeFarmWeatherStats(bundle)

    expect(stats.temperature.mean).toBe(31.5)

    expect(stats.temperature.range).toBe(9)

    expect(stats.humidity.mean).toBe(40)

    expect(stats.wind.maxKmh).toBe(22)

    expect(stats.precip.weeklyTotalMm).toBe(1.3)

    expect(farmWeatherStatsHasValues(stats)).toBe(true)

  })

})



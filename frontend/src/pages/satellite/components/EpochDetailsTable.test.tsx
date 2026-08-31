import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EpochDetailsTable } from './EpochDetailsTable'

afterEach(cleanup)

const rows = [
  {
    epoch: 1,
    train_loss: 1163.396,
    val_loss: 312.6799,
    seconds: 5,
    learning_rate: 0.00006,
    train_accuracy: 0.41,
    val_accuracy: 0.469581,
    metrics: { average_precision: 0.469581, f1: 0.42 },
  },
  {
    epoch: 2,
    train_loss: 1144.246,
    val_loss: 292.8703,
    seconds: 65,
    learning_rate: 0.00006,
    train_accuracy: 0.5,
    val_accuracy: 0.535063,
    metrics: { average_precision: 0.535063, f1: 0.5 },
  },
]

describe('EpochDetailsTable', () => {
  it('lists losses, accuracies, LR, wall time and leftover metrics', () => {
    render(<EpochDetailsTable rows={rows} />)
    expect(screen.getByText('Epochs Details')).toBeTruthy()
    expect(screen.getByText('Training Loss')).toBeTruthy()
    expect(screen.getByText('Validation Loss')).toBeTruthy()
    expect(screen.getByText('Training Acc')).toBeTruthy()
    expect(screen.getByText('Validation Acc')).toBeTruthy()
    expect(screen.getByText('Learning Rate')).toBeTruthy()
    expect(screen.getByText('1163.396')).toBeTruthy()
    expect(screen.getByText('312.6799')).toBeTruthy()
    expect(screen.getByText('41.00%')).toBeTruthy()
    expect(screen.getByText('46.96%')).toBeTruthy()
    expect(screen.getByText('00:00:05')).toBeTruthy()
    expect(screen.getByText('00:01:05')).toBeTruthy()
    expect(screen.getByText(/"average_precision": 0\.469581/)).toBeTruthy()
    expect(screen.getByLabelText(/Best epoch/i)).toBeTruthy()
    expect(screen.getByLabelText(/Lowest val loss/i)).toBeTruthy()
  })

  it('keeps the Other Metrics column even without metric snapshots', () => {
    render(<EpochDetailsTable rows={[{ epoch: 1, train_loss: 0.5, val_loss: 0.6 }]} />)
    expect(screen.getByText('Other Metrics')).toBeTruthy()
    const metricsCell = document.querySelector('.si-epochs__metrics')
    expect(metricsCell?.textContent).toBe('—')
  })

  it('keeps only the most recent epochs on long runs', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      epoch: i + 1,
      train_loss: 1 / (i + 1),
      val_loss: 1 / (i + 1),
    }))
    render(<EpochDetailsTable rows={many} maxRows={10} />)
    expect(screen.getByText(/Showing the last 10 of 40 epochs/)).toBeTruthy()
    expect(screen.queryByRole('rowheader', { name: '1' })).toBeNull()
    expect(screen.getByRole('rowheader', { name: /40/ })).toBeTruthy()
  })

  it('renders nothing without history unless showEmpty is set', () => {
    const { container } = render(<EpochDetailsTable rows={[]} />)
    expect(container.querySelector('table')).toBeNull()
  })

  it('shows an empty-state row when showEmpty is set', () => {
    render(<EpochDetailsTable rows={[]} showEmpty />)
    expect(screen.getByText(/No epoch history yet/)).toBeTruthy()
  })
})

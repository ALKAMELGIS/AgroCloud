import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  AI_DL_MODEL_TYPE_OPTIONS,
  inferModelTypeFromFileName,
  modelAcceptForType,
  validateAndLoadModel,
  validateDlpkBuffer,
} from './siAiDlModelLoader'

function makeFile(name: string, content: string | ArrayBuffer | Uint8Array, type = 'application/octet-stream'): File {
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

describe('siAiDlModelLoader', () => {
  it('exposes all supported model type options', () => {
    expect(AI_DL_MODEL_TYPE_OPTIONS.map(o => o.id)).toEqual([
      'dlpk',
      'yolo',
      'tensorflow',
      'pytorch',
      'onnx',
      'custom',
    ])
    expect(modelAcceptForType('dlpk')).toBe('.dlpk')
    expect(modelAcceptForType('yolo')).toContain('.pt')
  })

  it('infers model type from file extension', () => {
    expect(inferModelTypeFromFileName('weights.dlpk')).toBe('dlpk')
    expect(inferModelTypeFromFileName('yolo.pt')).toBe('yolo')
    expect(inferModelTypeFromFileName('model.onnx')).toBe('onnx')
    expect(inferModelTypeFromFileName('checkpoint.pth')).toBe('pytorch')
  })

  it('validates DLPK and extracts EMD metadata', async () => {
    const zip = new JSZip()
    zip.file('esri_model_definition.emd', JSON.stringify({
      Framework: 'PyTorch',
      ModelType: 'ObjectDetection',
      ModelConfiguration: 'YOLO',
      ImageWidth: 640,
      ImageHeight: 640,
      Classes: ['Wheat', 'Barley', 'Road'],
    }))
    zip.file('model.pth', new Uint8Array(2048))
    const buf = await zip.generateAsync({ type: 'uint8array' })
    const result = await validateDlpkBuffer(buf, 'crop_detector.dlpk')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.metadata.framework).toBe('PyTorch')
    expect(result.metadata.architecture).toContain('YOLO')
    expect(result.metadata.classes).toEqual(['Wheat', 'Barley', 'Road'])
    expect(result.metadata.inputSize).toBe('640 x 640')
    expect(result.metadata.packageReady).toBe(true)
  })

  it('rejects invalid DLPK without EMD', async () => {
    const zip = new JSZip()
    zip.file('readme.txt', 'no emd here')
    const buf = await zip.generateAsync({ type: 'uint8array' })
    const result = await validateDlpkBuffer(buf, 'broken.dlpk')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.toLowerCase()).toContain('emd')
  })

  it('rejects incompatible extension for selected type', async () => {
    const file = makeFile('model.pth', new Uint8Array(2048))
    const result = await validateAndLoadModel(file, 'yolo')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('not compatible')
  })

  it('accepts YOLO .pt weights', async () => {
    const file = makeFile('yolo11n.pt', new Uint8Array(4096))
    const result = await validateAndLoadModel(file, 'yolo')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.metadata.framework).toContain('YOLO')
  })
})

import JSZip from 'jszip'
import type { AiDlObjectDetectionArch, AiDlTaskType } from './siAiDlTrainConfig'

export type AiDlModelTypeId = 'dlpk' | 'yolo' | 'tensorflow' | 'pytorch' | 'onnx' | 'custom'

export type AiDlModelLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

export type AiDlModelMetadata = {
  fileName: string
  fileSize: number
  modelType: AiDlModelTypeId
  framework: string
  architecture: string
  taskType: AiDlTaskType
  classes: string[]
  inputSize: string
  bands: string
  emdPath?: string
  packageReady: boolean
  detectedFrom: 'emd' | 'extension' | 'signature'
}

export type AiDlModelValidationResult =
  | { ok: true; metadata: AiDlModelMetadata }
  | { ok: false; error: string }

export type AiDlDetectionFeature = {
  id: string
  className: string
  confidence: number
  geometryType: 'bbox' | 'polygon'
}

export type AiDlDetectionSummary = {
  totalCount: number
  byClass: Array<{ className: string; count: number; avgConfidence: number }>
  features: AiDlDetectionFeature[]
}

export const AI_DL_MODEL_TYPE_OPTIONS: Array<{
  id: AiDlModelTypeId
  label: string
  hint: string
  accept: string
}> = [
  {
    id: 'dlpk',
    label: 'Esri Deep Learning Package (.dlpk)',
    hint: 'ArcGIS .dlpk with embedded .emd metadata',
    accept: '.dlpk',
  },
  {
    id: 'yolo',
    label: 'YOLO Model (.pt / .onnx)',
    hint: 'Ultralytics / YOLO weights',
    accept: '.pt,.onnx',
  },
  {
    id: 'tensorflow',
    label: 'TensorFlow Model (.h5 / SavedModel)',
    hint: 'Keras .h5 or SavedModel bundle',
    accept: '.h5,.pb,.zip',
  },
  {
    id: 'pytorch',
    label: 'PyTorch Model (.pth)',
    hint: 'PyTorch checkpoint',
    accept: '.pth,.pt',
  },
  {
    id: 'onnx',
    label: 'ONNX Model (.onnx)',
    hint: 'Open Neural Network Exchange',
    accept: '.onnx',
  },
  {
    id: 'custom',
    label: 'Custom AI Model Upload',
    hint: 'Auto-detect framework from file',
    accept: '.dlpk,.pt,.pth,.onnx,.h5,.pb,.zip,.emd,.json',
  },
]

const MIN_MODEL_BYTES = 512

const DEFAULT_CLASSES = ['Tree', 'Building', 'Vehicle', 'Field']

function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : ''
}

function uniqueClasses(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of values) {
    const label =
      typeof item === 'string'
        ? item
        : typeof item === 'object' && item && 'name' in item
          ? String((item as { name?: unknown }).name ?? '')
          : typeof item === 'object' && item && 'Value' in item
            ? String((item as { Value?: unknown }).Value ?? '')
            : ''
    const trimmed = label.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function formatInputSize(width: unknown, height: unknown, fallback = '416 x 416'): string {
  const w = Number(width)
  const h = Number(height)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `${w} x ${h}`
  return fallback
}

function inferArchitecture(framework: string, config: string, modelType: string): string {
  const hay = `${framework} ${config} ${modelType}`.toLowerCase()
  if (hay.includes('yolo')) return 'YOLO'
  if (hay.includes('mask') && hay.includes('rcnn')) return 'Mask R-CNN'
  if (hay.includes('faster') && hay.includes('rcnn')) return 'Faster R-CNN'
  if (hay.includes('retinanet')) return 'RetinaNet'
  if (hay.includes('ssd')) return 'SSD'
  if (hay.includes('unet')) return 'U-Net'
  return config || framework || 'Deep Learning'
}

function inferTaskType(modelType: string, architecture: string): AiDlTaskType {
  const hay = `${modelType} ${architecture}`.toLowerCase()
  if (hay.includes('pixel') || hay.includes('unet') || hay.includes('classification') && hay.includes('pixel'))
    return 'pixel-classification'
  if (hay.includes('segment') && !hay.includes('object')) return 'instance-segmentation'
  if (hay.includes('image classification') || hay.includes('classify')) return 'image-classification'
  return 'object-detection'
}

function architectureToArgsKey(architecture: string): AiDlObjectDetectionArch {
  const lower = architecture.toLowerCase()
  if (lower.includes('yolo')) return 'yolo'
  if (lower.includes('mask')) return 'mask-rcnn'
  if (lower.includes('faster')) return 'faster-rcnn'
  if (lower.includes('retinanet')) return 'retinanet'
  return 'ssd'
}

export function architectureKeyFromMetadata(metadata: AiDlModelMetadata): AiDlObjectDetectionArch {
  return architectureToArgsKey(metadata.architecture)
}

export function modelAcceptForType(type: AiDlModelTypeId): string {
  return AI_DL_MODEL_TYPE_OPTIONS.find(o => o.id === type)?.accept ?? '.dlpk,.pt,.onnx,.pth,.h5'
}

export function inferModelTypeFromFileName(fileName: string): AiDlModelTypeId | null {
  const ext = extOf(fileName)
  if (ext === '.dlpk') return 'dlpk'
  if (ext === '.onnx') return 'onnx'
  if (ext === '.h5' || ext === '.pb') return 'tensorflow'
  if (ext === '.pth') return 'pytorch'
  if (ext === '.pt') return 'yolo'
  if (ext === '.emd' || ext === '.json') return 'custom'
  if (ext === '.zip') return 'tensorflow'
  return null
}

function extensionMatchesType(ext: string, type: AiDlModelTypeId): boolean {
  if (type === 'dlpk') return ext === '.dlpk'
  if (type === 'yolo') return ext === '.pt' || ext === '.onnx'
  if (type === 'tensorflow') return ext === '.h5' || ext === '.pb' || ext === '.zip'
  if (type === 'pytorch') return ext === '.pth' || ext === '.pt'
  if (type === 'onnx') return ext === '.onnx'
  return ['.dlpk', '.pt', '.pth', '.onnx', '.h5', '.pb', '.zip', '.emd', '.json'].includes(ext)
}

function parseEmdJson(raw: unknown, fileName: string): AiDlModelMetadata {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const framework = String(doc.Framework ?? doc.framework ?? 'PyTorch')
  const modelType = String(doc.ModelType ?? doc.modelType ?? doc.ModelName ?? 'ObjectDetection')
  const modelConfig = String(
    doc.ModelConfiguration ?? doc.modelConfiguration ?? doc.Architecture ?? doc.architecture ?? '',
  )
  const architecture = inferArchitecture(framework, modelConfig, modelType)
  const classes = uniqueClasses(doc.Classes ?? doc.classes ?? doc.ClassNames ?? doc.classNames)
  const inputSize = formatInputSize(
    doc.ImageWidth ?? doc.imageWidth ?? doc.Width,
    doc.ImageHeight ?? doc.imageHeight ?? doc.Height,
    typeof doc.ImageSize === 'string' ? doc.ImageSize : '416 x 416',
  )
  const bands = String(doc.Bands ?? doc.bands ?? doc.InputBands ?? 'RGB')
  const taskType = inferTaskType(modelType, architecture)

  return {
    fileName,
    fileSize: 0,
    modelType: 'dlpk',
    framework,
    architecture,
    taskType,
    classes: classes.length ? classes : DEFAULT_CLASSES,
    inputSize,
    bands,
    emdPath: fileName,
    packageReady: true,
    detectedFrom: 'emd',
  }
}

async function readEmdFromZip(zip: JSZip): Promise<{ text: string; path: string } | null> {
  const entries = Object.keys(zip.files).filter(k => !zip.files[k].dir && k.toLowerCase().endsWith('.emd'))
  if (!entries.length) return null
  const path = entries.sort((a, b) => a.length - b.length)[0]
  const text = await zip.file(path)!.async('text')
  return { text, path }
}

export async function validateDlpkBuffer(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<AiDlModelValidationResult> {
  let zip: JSZip
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    zip = await JSZip.loadAsync(bytes)
  } catch {
    return { ok: false, error: 'Invalid .dlpk package — file is not a valid ZIP archive.' }
  }

  const emd = await readEmdFromZip(zip)
  if (!emd) {
    return { ok: false, error: 'DLPK package is missing Esri model definition (.emd).' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(emd.text)
  } catch {
    return { ok: false, error: 'DLPK .emd metadata is not valid JSON.' }
  }

  const metadata = parseEmdJson(parsed, fileName)
  metadata.fileSize = bytesLength(data)
  metadata.modelType = 'dlpk'
  metadata.emdPath = emd.path
  metadata.packageReady = true
  return { ok: true, metadata }
}

function bytesLength(data: ArrayBuffer | Uint8Array): number {
  return data instanceof Uint8Array ? data.byteLength : data.byteLength
}

async function validateDlpkPackage(file: File): Promise<AiDlModelValidationResult> {
  try {
    const buffer = await file.arrayBuffer()
    const result = await validateDlpkBuffer(buffer, file.name)
    if (result.ok) result.metadata.fileSize = file.size
    return result
  } catch {
    return { ok: false, error: 'Invalid .dlpk package — file is not a valid ZIP archive.' }
  }
}

async function validateEmdFile(file: File): Promise<AiDlModelValidationResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { ok: false, error: 'Model definition (.emd) is not valid JSON.' }
  }
  const metadata = parseEmdJson(parsed, file.name)
  metadata.fileSize = file.size
  metadata.modelType = 'custom'
  metadata.packageReady = false
  return { ok: true, metadata }
}

function isOnnxBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 8))
  if (bytes.length < 4) return false
  // ONNX protobuf often starts with 0x08; also accept ASCII "ONNX" in some exports
  const header = String.fromCharCode(...bytes.slice(0, 4))
  return header.includes('ONNX') || bytes[0] === 0x08
}

function metadataFromExtension(file: File, type: AiDlModelTypeId): AiDlModelMetadata {
  const ext = extOf(file.name)
  const framework =
    type === 'yolo'
      ? 'Ultralytics YOLO'
      : type === 'tensorflow'
        ? 'TensorFlow'
        : type === 'pytorch'
          ? 'PyTorch'
          : type === 'onnx'
            ? 'ONNX Runtime'
            : 'Custom'

  const architecture =
    type === 'yolo'
      ? ext === '.onnx'
        ? 'YOLO (ONNX)'
        : 'YOLO'
      : type === 'tensorflow'
        ? ext === '.h5'
          ? 'Keras H5'
          : 'SavedModel'
        : type === 'pytorch'
          ? 'PyTorch Checkpoint'
          : type === 'onnx'
            ? 'ONNX'
            : 'Custom Model'

  return {
    fileName: file.name,
    fileSize: file.size,
    modelType: type,
    framework,
    architecture,
    taskType: 'object-detection',
    classes: DEFAULT_CLASSES,
    inputSize: type === 'yolo' ? '640 x 640' : '416 x 416',
    bands: 'RGB',
    packageReady: type === 'dlpk',
    detectedFrom: 'extension',
  }
}

async function validateWeightFile(file: File, type: AiDlModelTypeId): Promise<AiDlModelValidationResult> {
  const ext = extOf(file.name)
  if (!extensionMatchesType(ext, type) && type !== 'custom') {
    return {
      ok: false,
      error: `File extension ${ext || '(none)'} is not compatible with the selected model type.`,
    }
  }

  if (file.size < MIN_MODEL_BYTES) {
    return { ok: false, error: 'Model file is too small or empty — upload a valid trained model.' }
  }

  if (type === 'onnx' || (type === 'yolo' && ext === '.onnx') || (type === 'custom' && ext === '.onnx')) {
    const buf = await file.arrayBuffer()
    if (!isOnnxBuffer(buf)) {
      return { ok: false, error: 'Invalid ONNX model — unsupported or corrupted file format.' }
    }
  }

  const resolvedType =
    type === 'custom' ? inferModelTypeFromFileName(file.name) ?? 'custom' : type
  const metadata = metadataFromExtension(file, resolvedType)
  metadata.detectedFrom = ext === '.onnx' ? 'signature' : 'extension'
  return { ok: true, metadata }
}

export async function validateAndLoadModel(
  file: File,
  selectedType: AiDlModelTypeId,
): Promise<AiDlModelValidationResult> {
  const ext = extOf(file.name)

  if (selectedType === 'dlpk') {
    if (ext !== '.dlpk') {
      return { ok: false, error: 'Esri Deep Learning Package must be a .dlpk file.' }
    }
    return validateDlpkPackage(file)
  }

  if (ext === '.emd') {
    return validateEmdFile(file)
  }

  if (ext === '.dlpk') {
    return validateDlpkPackage(file)
  }

  return validateWeightFile(file, selectedType)
}

export function simulateDetectionResults(metadata: AiDlModelMetadata): AiDlDetectionSummary {
  const classes = metadata.classes.length ? metadata.classes : DEFAULT_CLASSES
  const features: AiDlDetectionFeature[] = []
  const counts = new Map<string, { count: number; confidenceSum: number }>()

  const total = Math.min(12, Math.max(4, classes.length * 2))
  for (let i = 0; i < total; i += 1) {
    const className = classes[i % classes.length]
    const confidence = 0.55 + ((i * 17) % 40) / 100
    const geometryType: 'bbox' | 'polygon' = i % 3 === 0 ? 'polygon' : 'bbox'
    features.push({
      id: `det-${i + 1}`,
      className,
      confidence,
      geometryType,
    })
    const prev = counts.get(className) ?? { count: 0, confidenceSum: 0 }
    counts.set(className, {
      count: prev.count + 1,
      confidenceSum: prev.confidenceSum + confidence,
    })
  }

  const byClass = [...counts.entries()].map(([className, stat]) => ({
    className,
    count: stat.count,
    avgConfidence: stat.confidenceSum / stat.count,
  }))

  return { totalCount: features.length, byClass, features }
}

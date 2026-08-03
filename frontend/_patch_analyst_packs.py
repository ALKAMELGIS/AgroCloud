from pathlib import Path
import re

path = Path(r'c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Projects\AgroCloud-main\frontend\src\pages\satellite\SatelliteIntelligence.tsx')
text = path.read_text(encoding='utf-8')

# 1) Add runSatelliteGeoAiAnalystPackIfMatched to Gemini pipeline deps
idx = text.find('const runSatelliteGeoExplorerGeminiPipeline = useCallback(')
chunk = text[idx:idx+15000]
m = re.search(r'\},\s*\[([^\]]*?applySatelliteGeoAiMapFirstSync[^\]]*?)\]\s*,\s*\);', chunk, re.S)
if not m:
    print('DEPS NOT FOUND')
    di = chunk.find('applySatelliteGeoAiMapFirstSync')
    print(repr(chunk[di-200:di+400]) if di >= 0 else 'no anchor')
else:
    deps = m.group(1)
    if 'runSatelliteGeoAiAnalystPackIfMatched' not in deps:
        new_deps = deps.rstrip() + ',\n      runSatelliteGeoAiAnalystPackIfMatched'
        text = text[:idx] + chunk[:m.start(1)] + new_deps + chunk[m.end(1):]
        print('DEPS UPDATED')
    else:
        print('DEPS ALREADY OK')

def make_pack_block(provider: str, setter: str, id_prefix: str, has_api_key: bool) -> str:
    api_line = "            apiKey,\n" if has_api_key else ""
    return f'''          const packChipId = geoAiPendingChipIdRef.current;
          geoAiPendingChipIdRef.current = undefined;
          const packHistory: GeoAiAgentChatTurn[] = historyWithUser.slice(0, -1).map(m => ({{
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.parts
              .filter((p): p is Extract<GeoExplorerPart, {{ type: 'text' }}> => p.type === 'text')
              .map(p => p.text)
              .join('\\n'),
          }}));
          const packResult = await runSatelliteGeoAiAnalystPackIfMatched({{
            provider: '{provider}',
            userMessage: trimmed,
            history: packHistory,
            vectorLayers: mergedLayersForStats,
{api_line}            chipId: packChipId,
          }});
          if (packResult) {{
            const aid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `{id_prefix}-${{Date.now()}}`;
            const parts: GeoExplorerPart[] = [{{ type: 'text', text: packResult.replyText }}];
            if (packResult.table) parts.push({{ type: 'dataTable', table: packResult.table }});
            {setter}(h => [...h, {{ id: aid, role: 'model', parts }}]);
            if (packResult.mapFirstSync?.selections?.length) {{
              queueMicrotask(() => applySatelliteGeoAiMapFirstSync(packResult.mapFirstSync!.selections));
            }}
            if (packResult.mapQueryLngLat) {{
              setGeoAiPinLngLat(packResult.mapQueryLngLat);
            }}
            return;
          }}
'''

handlers = [
    ('claude', 'const sendGeoAiChat = useCallback', 'setGeoAiChatMessages', 'gaic-pack', True),
    ('deepseek', 'const sendGeoDeepseekChat = useCallback', 'setGeoDeepseekChatMessages', 'gds-pack', True),
    ('ollama', 'const sendGeoOllamaChat = useCallback', 'setGeoOllamaChatMessages', 'goll-pack', False),
]

markers = [h[1] for h in handlers]
for provider, marker, setter, id_prefix, has_api_key in handlers:
    start = text.find(marker)
    if start < 0:
        print('HANDLER MISSING', provider)
        continue
    next_starts = [text.find(m, start + 10) for m in markers if text.find(m, start + 10) > start]
    # also stop at handleGeoAiAgentQuickAction
    qa = text.find('const handleGeoAiAgentQuickAction', start + 10)
    if qa > start:
        next_starts.append(qa)
    end = min(next_starts) if next_starts else start + 9000
    section = text[start:end]
    if 'runSatelliteGeoAiAnalystPackIfMatched' in section and 'packResult' in section:
        print('ALREADY PATCHED', provider)
        continue
    needle = '          const localStats = runGeoAiStatsCommand(trimmed, mergedLayersForStats);'
    if needle not in section:
        print('LOCALSTATS NEEDLE MISSING', provider)
        continue
    pack = make_pack_block(provider, setter, id_prefix, has_api_key)
    section2 = section.replace(needle, pack + needle, 1)
    text = text[:start] + section2 + text[end:]
    print('PATCHED', provider)

# Update dependency arrays for send handlers
for marker in markers:
    start = text.find(marker)
    end_candidates = [text.find(em, start + 20) for em in markers + ['const handleGeoAiAgentQuickAction']]
    ends = [e for e in end_candidates if e > start]
    end = min(ends) if ends else start + 10000
    section = text[start:end]
    matches = list(re.finditer(r'\},\s*\n\s*\[(.*?)\]\s*,\s*\n\s*\);', section, re.S))
    if not matches:
        print('NO DEPS ARRAY', marker)
        continue
    last = matches[-1]
    deps = last.group(1)
    if 'runSatelliteGeoAiAnalystPackIfMatched' in deps:
        print('DEPS OK', marker)
        continue
    new_deps = deps.rstrip() + ',\n      runSatelliteGeoAiAnalystPackIfMatched'
    section2 = section[: last.start(1)] + new_deps + section[last.end(1) :]
    text = text[:start] + section2 + text[end:]
    print('DEPS PATCHED', marker)

old_qa = '''  const handleGeoAiAgentQuickAction = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      if (geoAiModelTab === 'gemini') {'''
new_qa = '''  const handleGeoAiAgentQuickAction = useCallback(
    (prompt: string, chipId?: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      geoAiPendingChipIdRef.current = chipId;
      if (geoAiModelTab === 'gemini') {'''
if old_qa in text:
    text = text.replace(old_qa, new_qa, 1)
    print('QUICK ACTION PATCHED')
else:
    print('QUICK ACTION NOT FOUND')
    qi = text.find('handleGeoAiAgentQuickAction')
    print(repr(text[qi : qi + 280]))

path.write_text(text, encoding='utf-8')
print('DONE')

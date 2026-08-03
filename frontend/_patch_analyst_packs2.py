from pathlib import Path

path = Path(r'c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Projects\AgroCloud-main\frontend\src\pages\satellite\SatelliteIntelligence.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        '''    [
      geminiApiKey,
      customLayers,
      mapboxToken,
      openWeatherApiKey,
      geoAiPinLngLat,
      geoAiInspectCard,
      is3DView,
      stageGeoAiInspectCard,
    ],
  );

  const saveEditedGeoExplorerGeminiQuestion = useCallback(''',
        '''    [
      geminiApiKey,
      customLayers,
      mapboxToken,
      openWeatherApiKey,
      geoAiPinLngLat,
      geoAiInspectCard,
      is3DView,
      stageGeoAiInspectCard,
      runSatelliteGeoAiAnalystPackIfMatched,
    ],
  );

  const saveEditedGeoExplorerGeminiQuestion = useCallback(''',
    ),
    (
        '''  }, [
    claudeApiKey,
    geoAiDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

  const sendGeoDeepseekChat = useCallback''',
        '''  }, [
    claudeApiKey,
    geoAiDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
    runSatelliteGeoAiAnalystPackIfMatched,
  ]);

  const sendGeoDeepseekChat = useCallback''',
    ),
    (
        '''  }, [
    deepseekApiKey,
    geoDeepseekDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
  ]);

  const sendGeoOllamaChat = useCallback''',
        '''  }, [
    deepseekApiKey,
    geoDeepseekDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
    runSatelliteGeoAiAnalystPackIfMatched,
  ]);

  const sendGeoOllamaChat = useCallback''',
    ),
    (
        '''  }, [
    ollamaConfig,
    geoOllamaDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
    deepseekApiKey,
    geminiApiKey,
  ]);

  const handleGeoAiAgentQuickAction = useCallback(''',
        '''  }, [
    ollamaConfig,
    geoOllamaDraft,
    applySatelliteGeoAiMapUi,
    applySatelliteGeoAiMapFirstSync,
    customLayers,
    mapboxToken,
    openWeatherApiKey,
    geoAiPinLngLat,
    geoAiInspectCard,
    deepseekApiKey,
    geminiApiKey,
    runSatelliteGeoAiAnalystPackIfMatched,
  ]);

  const handleGeoAiAgentQuickAction = useCallback(''',
    ),
]

for i, (old, new) in enumerate(replacements):
    if old not in text:
        print(f'MISS {i}')
    else:
        text = text.replace(old, new, 1)
        print(f'OK {i}')

# Live map state object ref
old_live = '''    return buildGeoAiLiveMapStateBlock(state);
  }, [
    viewState,
    is3DView,
    currentBasemapLabel,
    basemapVisible,
    activeWmsLayer,
    isWmsOverlayVisible,
    customLayers,
    drawnGeometry,
    wmsDate,
    geoAiActiveAnalysisLayerId,
    geoAiClassAreas.result,
    geoAiClassAreas.loading,
    geoAiClassAreas.error,
    geoAiInspectCard,
    geoAiBasemapFeatures,
  ]);
  const geoAiLiveMapStateBlockRef = useRef(geoAiLiveMapStateBlock);
  geoAiLiveMapStateBlockRef.current = geoAiLiveMapStateBlock;'''

new_live = '''    geoAiLiveMapStateObjRef.current = state;
    return buildGeoAiLiveMapStateBlock(state);
  }, [
    viewState,
    is3DView,
    currentBasemapLabel,
    basemapVisible,
    activeWmsLayer,
    isWmsOverlayVisible,
    customLayers,
    drawnGeometry,
    wmsDate,
    geoAiActiveAnalysisLayerId,
    geoAiClassAreas.result,
    geoAiClassAreas.loading,
    geoAiClassAreas.error,
    geoAiInspectCard,
    geoAiBasemapFeatures,
  ]);
  const geoAiLiveMapStateBlockRef = useRef(geoAiLiveMapStateBlock);
  geoAiLiveMapStateBlockRef.current = geoAiLiveMapStateBlock;'''

if old_live in text:
    text = text.replace(old_live, new_live, 1)
    print('LIVE STATE REF OK')
else:
    print('LIVE STATE REF MISS')

# Handlers ref after handlers object built
old_handlers = '''      executeGeoAiMapCommands(commands, handlers);
    },
    [
      customLayers,
      drawnGeometry,
      basemapCatalog,
      activeWmsLayer,
      currentBasemapLabel,
      mapboxToken,
      getMapProximity,
      handleSelectSearchResult,
      stageGeoAiInspectCard,
    ],
  );
  const runGeoAiMapCommandsRef = useRef(runGeoAiMapCommandsFromReply);
  runGeoAiMapCommandsRef.current = runGeoAiMapCommandsFromReply;'''

new_handlers = '''      geoAiMapCommandHandlersRef.current = handlers;
      executeGeoAiMapCommands(commands, handlers);
    },
    [
      customLayers,
      drawnGeometry,
      basemapCatalog,
      activeWmsLayer,
      currentBasemapLabel,
      mapboxToken,
      getMapProximity,
      handleSelectSearchResult,
      stageGeoAiInspectCard,
    ],
  );
  const runGeoAiMapCommandsRef = useRef(runGeoAiMapCommandsFromReply);
  runGeoAiMapCommandsRef.current = runGeoAiMapCommandsFromReply;'''

if old_handlers in text:
    text = text.replace(old_handlers, new_handlers, 1)
    print('HANDLERS REF OK')
else:
    print('HANDLERS REF MISS')

path.write_text(text, encoding='utf-8')
print('DONE')

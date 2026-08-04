content = open('src/App.tsx').read()
content = content.replace(
    'upscaler.start();\n            video.muted = true;\n            video.currentTime = 0;',
    'upscaler.start();\n            video.muted = true;\n            video.loop = false;\n            video.currentTime = 0;'
)
open('src/App.tsx', 'w').write(content)

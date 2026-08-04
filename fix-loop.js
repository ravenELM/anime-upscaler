const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace loop with loop={status === 'completed'} for the original video in the compare slider
content = content.replace(
    '                          muted\n                          loop\n                          playsInline\n                        />\n                      </div>\n                    )\n                  }',
    '                          muted\n                          loop={status === \'completed\'}\n                          playsInline\n                        />\n                      </div>\n                    )\n                  }'
);

fs.writeFileSync('src/App.tsx', content);

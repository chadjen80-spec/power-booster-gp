# Third-Party Notices

Power Booster GP uses the third-party components listed below. Each is licensed
under its own terms, reproduced or linked here. These licenses permit commercial
use; keep this file with any copy of the game you distribute.

| Component | Version | Used for | License | Delivered |
|---|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) (incl. `examples/js` post-processing: EffectComposer, RenderPass, ShaderPass, MaskPass, UnrealBloomPass, CopyShader, LuminosityHighPassShader) | 0.147.0 | 3D rendering | MIT | Loaded from the jsDelivr CDN |
| [ws](https://github.com/websockets/ws) | 8.22.1 | Multiplayer WebSocket server | MIT | npm dependency of `server.js` |
| [stripe-node](https://github.com/stripe/stripe-node) | 23.x | Payments (server) | MIT | npm dependency of `payments.js` |
| [supabase-js](https://github.com/supabase/supabase-js) | 2.45.4 | Player sign-in (web) | MIT | Loaded from the jsDelivr CDN when player accounts are on |
| [Kanit](https://github.com/cadsondemak/kanit) font | — | Thai UI text | SIL Open Font License 1.1 | Loaded from Google Fonts |
| [Orbitron](https://github.com/theleagueof/orbitron) font | — | Logo / HUD text | SIL Open Font License 1.1 | Loaded from Google Fonts |

If you later bundle any of these files with the game instead of loading them from
a CDN or Google Fonts (for example for offline play), the notices below must stay
with the bundled copies.

---

## three.js — MIT License

```
The MIT License

Copyright © 2010-2022 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## ws — MIT License

```
Copyright (c) 2011 Einar Otto Stangvik <einaros@gmail.com>
Copyright (c) 2013 Arnout Kazemier and contributors
Copyright (c) 2016 Luigi Pinca and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Kanit — SIL Open Font License 1.1

```
Copyright 2020 The Kanit Project Authors (https://github.com/cadsondemak/kanit)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
```

Full license text: https://openfontlicense.org/open-font-license-official-text/

## Orbitron — SIL Open Font License 1.1

```
Copyright 2018 The Orbitron Project Authors (https://github.com/theleagueof/orbitron),
with Reserved Font Name: "Orbitron"

This Font Software is licensed under the SIL Open Font License, Version 1.1.
```

Full license text: https://openfontlicense.org/open-font-license-official-text/

The fonts are used unmodified. Under the OFL they may be used in commercial
products; the font files themselves may not be sold on their own, and a modified
version of Orbitron may not use the reserved name "Orbitron".

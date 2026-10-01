# Third-party notices

This project is [MIT licensed](LICENSE). It depends on two MIT-licensed
projects, **neither of which is redistributed in this repository**.

These notices live here rather than in `LICENSE` for a practical reason:
GitHub's licence detection matches the whole file against known templates, so
appending anything to `LICENSE` makes the repository report `NOASSERTION`
instead of `MIT` — and a repository with no detectable licence is filtered out
of most licence-based searches.

## three.js

<https://threejs.org> — MIT License, Copyright © 2010-2024 three.js authors.

Used as the rendering engine. Not vendored here: `node tools/fetch-deps.mjs`
downloads it from the npm registry, and `tools/build.mjs` inlines it into
`dist/cyberpunk-city.html`. That single file therefore **does** contain
three.js, and redistributing it means redistributing three.js under the same
MIT terms — the copyright notice below covers it:

```
Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## esbuild

<https://esbuild.github.io> — MIT License, Copyright © 2020 Evan Wallace.

Used at **build time only** to bundle the sources. It is not inlined into
`dist/cyberpunk-city.html` and is not required to run the result.

```
Copyright © 2020 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

# TraceViz Web Demo

This is [TraceViz](https://github.com/ardoco/traceviz) running in VS Code for the Web.
TraceViz shows trace links between Software Architecture Documentation (SAD) and source code.

## Try it

1. `docs/mediastore.txt` is the architecture documentation of MediaStore (one sentence per line).
   Lines with trace links have a colored dot in the gutter.
2. Click a dot, the CodeLens above a line, or the status bar entry to list the linked code files and open one.
3. In a linked Java file, use the status bar entry to jump back to the documentation sentences.
4. In the **Trace History** view (chain link icon in the activity bar), show/hide a link set with the eye icon
   or change its color. Two link sets are preloaded and shown side by side:
   - **blue**: the gold standard of the ARDoCo benchmark
   - **red**: trace links recovered by ArDoCode (ARDoCo's SAD-Code approach), precomputed
5. With both sets shown, the hover and the CodeLens of a line compare them with the gold standard:
   links in both sets (TP), only in ArDoCode (FP) and only in the gold standard (FN).
   The Trace History tooltip shows each set's size and ArDoCode's precision, recall and F1.
6. The explorer marks linked files with the number of linked sentences (colored if only one set links the file).
   The circle icon in the Trace History title marks sentences without any trace link.
7. **CSV Direct** imports another CSV file (`sentenceID,codeID`, code paths relative to the workspace root),
   e.g. the files in `tracelinks/`.
8. **Run ARDoCo yourself:** in the **Traceability Approach** view, expand **ARDoCo** > **Generate Trace Links**
   and click **ArDoCode (SAD-Code)** (or **TransArC (SAD-SAM-Code)**). TraceViz sends `docs/mediastore.txt`,
   the code model `models/codeModel.acm` (and the PCM model `models/ms.repository` for TransArC)
   to the ARDoCo REST API at https://rest.ardoco.de; the result appears as a new Trace History entry after
   about a minute. The configuration is preset in `.trace-viz/ardoco-config.json`; change it with the gear icon
   (webview) or the list icon (**Configure ARDoCo (without Webview)**, for browsers that block the webview).

Changes stay in your browser tab only; reloading the page restores the demo.
Code model extraction (Java) and LiSSA need local tools and are only available in the desktop version of TraceViz.

## Data and licenses

- `Implementation/` and `README.md`: the [MediaStore3](https://github.com/ArDoCo/MediaStore3) case study
  (commit `94c398fa02b3d6b8d71517522a7206d37ed3a9af`, only the implementation),
  licensed under the GNU General Public License v3.0, see `Implementation/gpl-3.0.txt`.
- `docs/mediastore.txt`, `tracelinks/goldstandard_sad_2016-code_2016.csv`, `models/codeModel.acm` and
  `models/ms.repository`: SAD, SAD-code gold standard, code model and PCM repository model from the
  [ARDoCo Benchmark](https://github.com/ArDoCo/Benchmark) (commit `e60ddb2676358048131178c925e86a5b33ec38f2`, MIT License).
- `tracelinks/ardocode_mediastore.csv`: output of ArDoCode on this benchmark project, produced by an
  ARDoCo TLR integration-test run (March 2025); header renamed to `sentenceID,codeID`, links unchanged.
  It is an actual approach result, not hand-made, and it is not tuned for this demo.

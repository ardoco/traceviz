# trace-viz

trace-viz is a Visual Studio Code extension that integrates generated or imported trace links directly into the IDE. The extension supports multiple trace visualization modes such as sentence-to-file and file-to-file. It enables interactive exploration of trace links through inline markers, context tooltips, and quick navigation.

## Features

- **Multiple Traceability Approaches**: Support for [ArDoCo](https://github.com/ardoco/ardoco), [LiSSA](https://github.com/ArDoCo/LiSSA), and direct CSV imports
- **Interactive Visualization**: Inline code decorations showing trace links
- **Trace History**: Track and manage multiple trace link results
- **Flexible Configuration**: Configure traceability approaches through VS Code settings
- **CSV Support**: Import trace links directly from CSV files
- **Code Model Generation**: Generate code models from Java projects

## Getting Started

### Prerequisites

- Visual Studio Code `^1.100.0`
- Node.js and npm (for development)
- (Optional) [Java code model extractor](https://github.com/ardoco/code-model-extractor-cli) for advanced features

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ardoco/traceviz.git
   cd traceviz
   ```
   See [package.json](package.json) for project metadata and dependencies.

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Compile the extension**:
   ```bash
   npm run compile
   ```

### Running the Extension

#### Development Mode

1. **Start the TypeScript compiler in watch mode**:
   ```bash
   npm run watch
   ```

2. **Launch the extension**:
   - Press `F5` in VS Code, or
   - Go to **Run → Start Debugging** menu

   This will open a new VS Code window with the extension loaded.

3. **Activate the extension** by:
   - Opening the "Trace-Viz" view in the activity bar
   - Or executing any trace-viz command

#### Production Build

To package the extension for production:
```bash
npm run compile
```

### Usage

1. **Open a project folder** in VS Code
2. **Access Trace-Viz** from the activity bar (link icon)
3. **Choose a traceability approach** (see [src/traceabilityApproach/](src/traceabilityApproach/) for implementations):
   - **[ArDoCo](https://github.com/ardoco/ardoco)**: Configure and run ArDoCo for automated traceability (see [configArDoCo.ts](src/traceabilityApproach/ardoco/configArDoCo.ts))
   - **[LiSSA](https://github.com/ArDoCo/LiSSA)**: Configure and run LiSSA for learning-based traceability (see [configLissa.ts](src/traceabilityApproach/lissa/configLissa.ts))
   - **CSV Direct**: Import pre-generated trace links from CSV files (see [csvDirect.ts](src/traceabilityApproach/csv/csvDirect.ts))

4. **View and manage** trace results in the "Trace History" panel
5. **Visualize** trace links inline in your code

### Configuration

Configure trace-viz in VS Code settings:

- **`trace-viz.codeModelExtractorJar`**: Path to the code model extractor JAR file
  - Required for generating code models
  - Download from [code-model-extractor-cli](https://github.com/ardoco/code-model-extractor-cli)
  - See [src/utils/ardocoApi.util.ts](src/utils/ardocoApi.util.ts) for implementation details

- **`trace-viz.logLevel`**: Controls logging verbosity
  - Options: `DEBUG`, `INFO`, `WARN`, `ERROR`
  - Default: `INFO`

## Development

### Available Commands

```bash
# Compile TypeScript
npm run compile

# Watch mode (auto-compile on file changes)
npm run watch

# Run linter
npm run lint
```

### Project Structure

- [`src/commands/`](src/commands/) - VS Code command implementations (e.g., [browseJar.ts](src/commands/browseJar.ts), [visualization.ts](src/commands/visualization.ts))
- [`src/services/`](src/services/) - Core business logic and utilities (e.g., [csvReader.service.ts](src/services/csvReader.service.ts), [decoration.service.ts](src/services/decoration.service.ts))
- [`src/traceabilityApproach/`](src/traceabilityApproach/) - Traceability algorithm implementations ([ArDoCo](src/traceabilityApproach/ardoco/), [LiSSA](src/traceabilityApproach/lissa/), [CSV Direct](src/traceabilityApproach/csv/))
- [`src/views/`](src/views/) - VS Code view providers (e.g., [traceabilityApproachViewProvider.ts](src/views/traceabilityApproachViewProvider.ts))
- [`src/visualization/`](src/visualization/) - Visualization and decoration logic

## Contributing

Contributions are welcome! Please ensure:
- Code passes linting: `npm run lint`
- TypeScript compilation succeeds: `npm run compile`

## License

See [LICENSE](LICENSE) file for details.

## Acknowledgements

This extension is a bachelor thesis implementation by Julian Winter.

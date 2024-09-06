/**
 * @fileoverview ESLint Processor Service
 * @author Nicholas C. Zakas
 */
/* eslint class-methods-use-this: off -- Anticipate future constructor arguments. */

"use strict";

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

const path = require("node:path");
const { VFile } = require("../linter/vfile.js");

//-----------------------------------------------------------------------------
// Types
//-----------------------------------------------------------------------------

/** @typedef {import("../shared/types.js").LintMessage} LintMessage */
/** @typedef {import("../linter/vfile.js").VFile} VFile */
/** @typedef {import("@eslint/core").Language} Language */
/** @typedef {import("@eslint/core").LanguageOptions} LanguageOptions */
/** @typedef {import("eslint").Linter.Processor} Processor */

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/**
 * Reconstructs the body of a file to include the BOM.
 * @param {VFile} file The file to get the body with BOM.
 * @returns {string|Uint8Array} The body with BOM.
 */
function getBodyWithBOM(file) {

    if (!file.bom) {
        return file.body;
    }


    if (typeof file.body === "string") {
        return `\uFEFF${file.body}`;
    }

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const bodyWithBOM = new Uint8Array(bom.length + file.body.length);

    bodyWithBOM.set(bom);
    bodyWithBOM.set(file.body, bom.length);

    return bodyWithBOM;
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * The service that applies processors to files.
 */
class ProcessorService {

    /**
     * Preprocesses the given file synchronously.
     * @param {VFile} file The file to preprocess.
     * @param {{processor:Processor}} config The configuration to use.
     * @returns {{ok:boolean, files?: Array<VFile>, errors?: Array<LintMessage>}} An array of preprocessed files or errors.
     * @throws {Error} If the preprocessor returns a promise.
     */
    preprocessSync(file, config) {

        const { processor } = config;
        let blocks;

        try {
            blocks = processor.preprocess(getBodyWithBOM(file), file.path);
        } catch (ex) {

            // If the message includes a leading line number, strip it:
            const message = `Preprocessing error: ${ex.message.replace(/^line \d+:/iu, "").trim()}`;

            return {
                ok: false,
                errors: [
                    {
                        ruleId: null,
                        fatal: true,
                        severity: 2,
                        message,
                        line: ex.lineNumber,
                        column: ex.column,
                        nodeType: null
                    }
                ]
            };
        }

        if (typeof blocks.then === "function") {
            throw new Error("Unsupported: Preprocessor returned a promise.");
        }

        return {
            ok: true,
            files: blocks.map((block, i) => {

                // Legacy behavior: return the block as a string
                if (typeof block === "string") {
                    return block;
                }

                const filePath = path.join(file.path, `${i}_${block.filename}`);

                return new VFile(filePath, block.text, {
                    physicalPath: file.physicalPath
                });
            })
        };

    }

    /**
     * Postprocesses the given messages synchronously.
     * @param {VFile} file The file to postprocess.
     * @param {LintMessage[][]} messages The messages to postprocess.
     * @param {{processor:Processor}} config The configuration to use.
     * @returns {LintMessage[]} The postprocessed messages.
     */
    postprocessSync(file, messages, config) {

        const { processor } = config;

        if (processor.postprocess) {
            return processor.postprocess(messages, file.path);
        }

        return messages;
    }

}

module.exports = { ProcessorService };

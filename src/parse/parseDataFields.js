import {
    StringLiteral,
    TokenReader,
    Word,
    strlit,
    symbol
} from "@helios-lang/compiler-utils"
import { None } from "@helios-lang/type-utils"
import { DataField } from "../statements/index.js"
import { ParseContext } from "./ParseContext.js"
import { anyName } from "./parseName.js"
import { parseTypeExpr } from "./parseTypeExpr.js"

/**
 * @typedef {import("@helios-lang/compiler-utils").Site} Site
 */

/**
 * @param {ParseContext} ctx
 * @param {boolean} allowEncodingKeys
 * @returns {DataField[]}
 */
export function parseDataFields(ctx, allowEncodingKeys = false) {
    const r = ctx.reader

    /**
     * @type {DataField[]}
     */
    const fields = []

    /**
     * @type {Map<string, StringLiteral>}
     */
    const encodingKeys = new Map()

    /**
     * @param {Word} fieldName
     */
    function assertUniqueField(fieldName) {
        if (
            fields.findIndex(
                (f) => f.name.toString() == fieldName.toString()
            ) != -1
        ) {
            ctx.errors.syntax(
                fieldName.site,
                `duplicate field \'${fieldName.toString()}\'`
            )
        }
    }

    /**
     * @param {Site} site
     * @param {string} tag
     */
    function assertUniqueTag(site, tag) {
        if (encodingKeys.has(tag)) {
            ctx.errors.syntax(site, `duplicate tag '${tag}'`)
        }
    }

    /**
     * @param {Word} fieldName
     * @returns {Option<StringLiteral>}
     */
    function getFieldEncodingKey(fieldName) {
        const tag = encodingKeys.get(fieldName.value)

        if (tag) {
            return tag
        } else if (encodingKeys.size == 0) {
            return None
        } else if (encodingKeys.has(fieldName.value)) {
            ctx.errors.syntax(
                fieldName.site,
                `duplicate tag '${fieldName.value}' (created implicitly)`
            )
            return new StringLiteral(fieldName.value, fieldName.site)
        }
    }

    while (!r.isEof()) {
        let m

        if ((m = r.matches(anyName, symbol(":")))) {
            const [name, colon] = m

            assertUniqueField(name)

            let typeReader = r.readUntil(anyName, symbol(":"))

            /* @type{string} */
            let encodingKey

            if ((m = typeReader.findLastMatch(strlit()))) {
                /**
                 * @satisfies {[TokenReader, StringLiteral]}
                 */
                const [before, tag] = m
                typeReader.end()
                typeReader = before

                if (!allowEncodingKeys) {
                    ctx.errors.syntax(
                        tag.site,
                        "unexpected encodingKey tag in non-CIP68-struct context"
                    )
                } else {
                    assertUniqueTag(tag.site, tag.value)
                }
                encodingKey = tag.value
                encodingKeys.set(name.value, tag)
            } else {
                r.endMatch(false)

                if (encodingKeys.size > 0) {
                    assertUniqueTag(name.site, name.value)
                }
            }

            const typeExpr = parseTypeExpr(
                ctx.atSite(colon.site).withReader(typeReader)
            )
            fields.push(
                new DataField(
                    name,
                    encodingKey
                        ? typeExpr.withEncodingKey(encodingKey)
                        : typeExpr,
                    getFieldEncodingKey(name)
                )
            )
        } else {
            r.endMatch()
            r.end()
        }
    }

    return fields
}

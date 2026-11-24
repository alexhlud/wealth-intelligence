/// <reference types="node" />
// Node types for this test only. Vitest stubs CSS imports, even with ?raw,
// so the stylesheet and sources are read from disk.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every class name written in a className attribute must be defined in
 * src/index.css. An undefined class renders unstyled without any error.
 *
 * The scan reads string literals inside className="..." and className={...},
 * including both branches of a ternary and the static parts of a template.
 * Classes built at runtime from variables are not seen; list any such class
 * below with the reason it needs no CSS rule.
 */
const exceptions: Record<string, string> = {
  'app-error-boundary':
    'Naming hook beside auth-panel, which carries all of the styling.',
  dashboard: 'Naming hook on the Overview section; its children are styled.',
  error: 'Modifier beside form-message, whose base rule is already the error color.',
}

const srcRoot = import.meta.dirname

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    const isSource = /\.tsx?$/.test(entry.name)
    const isTest = /\.test\.tsx?$/.test(entry.name)
    return isSource && !isTest ? [path] : []
  })
}

/** Raw text of every non-test source file under src, keyed by path. */
const sources = Object.fromEntries(sourceFiles(srcRoot).map((file) => [
  relative(srcRoot, file),
  readFileSync(file, 'utf8'),
]))
const css = readFileSync(join(srcRoot, 'index.css'), 'utf8')

function classNamesIn(source: string): string[] {
  const names: string[] = []
  const literal = /className="([^"]*)"/g
  for (const match of source.matchAll(literal)) names.push(...match[1]!.split(/\s+/))
  const expression = /className=\{((?:[^{}]|\{[^{}]*\})*)\}/g
  for (const match of source.matchAll(expression)) {
    // A literal compared with === or !== is a value, not a class name.
    const expressionText = match[1]!.replace(/[=!]==\s*'[^']*'/g, '')
    const strings = expressionText.matchAll(/'([^']*)'|`([^`]*)`/g)
    for (const part of strings) {
      const text = (part[1] ?? part[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
      names.push(...text.split(/\s+/))
    }
  }
  return names.filter((name) => /^-?[a-z_][a-z0-9_-]*$/i.test(name))
}

function definedClasses(css: string): Set<string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const names = withoutComments.matchAll(/\.(-?[a-z_][a-z0-9_-]*)/gi)
  return new Set(Array.from(names, (match) => match[1]!))
}

describe('CSS class coverage', () => {
  it('defines every class name used in source', () => {
    const defined = definedClasses(css)
    const missing = new Set<string>()
    for (const [file, source] of Object.entries(sources)) {
      for (const name of classNamesIn(source)) {
        if (!defined.has(name) && !(name in exceptions)) {
          missing.add(`${name} (${file})`)
        }
      }
    }
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    expect([...missing].sort()).toEqual([])
  })

  it('finds class names in each supported form', () => {
    const sample = [
      '<p className="one two" />',
      "<p className={active ? 'three' : 'four'} />",
      '<p className={`five ${extra}`} />',
      "<p className={mode === 'value' ? 'six' : ''} />",
    ].join('\n')
    expect(classNamesIn(sample)).toEqual([
      'one', 'two', 'three', 'four', 'five', 'six',
    ])
  })
})

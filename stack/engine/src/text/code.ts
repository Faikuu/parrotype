import type { CodeLanguage, CodeLines, TestConfig } from '../engine/types';
import { pick, type Rng } from './rng';

export interface CodeSnippet {
  id: string;
  title: string;
  code: string;
}

/**
 * Short original snippets for code mode. Each is 4-12 lines, at most 70 chars per line, ASCII, indented with
 * spaces, with no trailing spaces and no blank lines. codeToWords splits them into the words to type.
 */
export const CODE_SNIPPETS: Record<CodeLanguage, CodeSnippet[]> = {
  js: [
    {
      id: 'js-fizzbuzz',
      title: 'FizzBuzz',
      code: [
        'for (let i = 1; i <= 15; i++) {',
        '  if (i % 15 === 0) {',
        '    console.log("FizzBuzz");',
        '  } else if (i % 3 === 0) {',
        '    console.log("Fizz");',
        '  } else if (i % 5 === 0) {',
        '    console.log("Buzz");',
        '  } else {',
        '    console.log(i);',
        '  }',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-binary-search',
      title: 'Binary search',
      code: [
        'function binarySearch(list, target) {',
        '  let lo = 0;',
        '  let hi = list.length - 1;',
        '  while (lo <= hi) {',
        '    const mid = Math.floor((lo + hi) / 2);',
        '    if (list[mid] === target) return mid;',
        '    if (list[mid] < target) lo = mid + 1;',
        '    else hi = mid - 1;',
        '  }',
        '  return -1;',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-debounce',
      title: 'Debounce',
      code: [
        'function debounce(fn, ms) {',
        '  let timer = null;',
        '  return function (...args) {',
        '    clearTimeout(timer);',
        '    timer = setTimeout(() => fn.apply(this, args), ms);',
        '  };',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-word-count',
      title: 'Word count',
      code: [
        'function countWords(text) {',
        '  const counts = new Map();',
        '  for (const word of text.toLowerCase().split(/\\W+/)) {',
        '    if (word === "") continue;',
        '    counts.set(word, (counts.get(word) ?? 0) + 1);',
        '  }',
        '  return counts;',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-chunk',
      title: 'Chunk an array',
      code: [
        'const chunk = (items, size) => {',
        '  const out = [];',
        '  for (let i = 0; i < items.length; i += size) {',
        '    out.push(items.slice(i, i + size));',
        '  }',
        '  return out;',
        '};',
      ].join('\n'),
    },
    {
      id: 'js-stack-class',
      title: 'A stack class',
      code: [
        'class Stack {',
        '  #items = [];',
        '  push(item) {',
        '    this.#items.push(item);',
        '    return this;',
        '  }',
        '  pop() {',
        '    return this.#items.pop();',
        '  }',
        '  get size() { return this.#items.length; }',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-group-by',
      title: 'Group by key',
      code: [
        'function groupBy(items, keyOf) {',
        '  return items.reduce((groups, item) => {',
        '    const key = keyOf(item);',
        '    (groups[key] ??= []).push(item);',
        '    return groups;',
        '  }, {});',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-memoize',
      title: 'Memoize',
      code: [
        'function memoize(fn) {',
        '  const cache = new Map();',
        '  return (arg) => {',
        '    if (!cache.has(arg)) cache.set(arg, fn(arg));',
        '    return cache.get(arg);',
        '  };',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-fibonacci',
      title: 'Fibonacci generator',
      code: [
        'function* fibonacci() {',
        '  let [a, b] = [0, 1];',
        '  while (true) {',
        '    yield a;',
        '    [a, b] = [b, a + b];',
        '  }',
        '}',
      ].join('\n'),
    },
    {
      id: 'js-average',
      title: 'Average',
      code: [
        'const average = (nums) => {',
        '  if (nums.length === 0) return NaN;',
        '  const total = nums.reduce((sum, n) => sum + n, 0);',
        '  return total / nums.length;',
        '};',
      ].join('\n'),
    },
  ],
  py: [
    {
      id: 'py-fizzbuzz',
      title: 'FizzBuzz',
      code: [
        'for n in range(1, 16):',
        '    if n % 15 == 0:',
        '        print("FizzBuzz")',
        '    elif n % 3 == 0:',
        '        print("Fizz")',
        '    elif n % 5 == 0:',
        '        print("Buzz")',
        '    else:',
        '        print(n)',
      ].join('\n'),
    },
    {
      id: 'py-binary-search',
      title: 'Binary search',
      code: [
        'def binary_search(items, target):',
        '    lo, hi = 0, len(items) - 1',
        '    while lo <= hi:',
        '        mid = (lo + hi) // 2',
        '        if items[mid] == target:',
        '            return mid',
        '        if items[mid] < target:',
        '            lo = mid + 1',
        '        else:',
        '            hi = mid - 1',
        '    return -1',
      ].join('\n'),
    },
    {
      id: 'py-top-words',
      title: 'Most common words',
      code: [
        'import re',
        'from collections import Counter',
        'def top_words(text, n=3):',
        '    words = re.findall(r"[a-z]+", text.lower())',
        '    return Counter(words).most_common(n)',
      ].join('\n'),
    },
    {
      id: 'py-point',
      title: 'A point with a distance',
      code: [
        'from dataclasses import dataclass',
        '@dataclass',
        'class Point:',
        '    x: float',
        '    y: float',
        '    def dist(self, other):',
        '        dx = self.x - other.x',
        '        dy = self.y - other.y',
        '        return (dx * dx + dy * dy) ** 0.5',
      ].join('\n'),
    },
    {
      id: 'py-chunks',
      title: 'Chunks generator',
      code: [
        'def chunks(items, size):',
        '    for start in range(0, len(items), size):',
        '        yield items[start:start + size]',
        'print(list(chunks(range(7), 3)))',
      ].join('\n'),
    },
    {
      id: 'py-stack-class',
      title: 'A stack class',
      code: [
        'class Stack:',
        '    def __init__(self):',
        '        self._items = []',
        '    def push(self, item):',
        '        self._items.append(item)',
        '    def pop(self):',
        '        return self._items.pop()',
        '    def __len__(self):',
        '        return len(self._items)',
      ].join('\n'),
    },
    {
      id: 'py-fibonacci-cache',
      title: 'Cached Fibonacci',
      code: [
        'from functools import lru_cache',
        '@lru_cache(maxsize=None)',
        'def fib(n):',
        '    if n < 2:',
        '        return n',
        '    return fib(n - 1) + fib(n - 2)',
      ].join('\n'),
    },
    {
      id: 'py-flatten',
      title: 'Flatten nested lists',
      code: [
        'def flatten(nested):',
        '    for item in nested:',
        '        if isinstance(item, list):',
        '            yield from flatten(item)',
        '        else:',
        '            yield item',
      ].join('\n'),
    },
    {
      id: 'py-group-by',
      title: 'Group by key',
      code: [
        'def group_by(items, key):',
        '    groups = {}',
        '    for item in items:',
        '        groups.setdefault(key(item), []).append(item)',
        '    return groups',
      ].join('\n'),
    },
    {
      id: 'py-average',
      title: 'Average',
      code: [
        'def average(nums):',
        '    if not nums:',
        '        raise ValueError("average of empty list")',
        '    return sum(nums) / len(nums)',
      ].join('\n'),
    },
  ],
  rs: [
    {
      id: 'rs-fizzbuzz',
      title: 'FizzBuzz',
      code: [
        'fn fizzbuzz(n: u32) -> String {',
        '    match (n % 3, n % 5) {',
        '        (0, 0) => String::from("FizzBuzz"),',
        '        (0, _) => String::from("Fizz"),',
        '        (_, 0) => String::from("Buzz"),',
        '        _ => n.to_string(),',
        '    }',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-binary-search',
      title: 'Binary search',
      code: [
        'fn binary_search(items: &[i32], target: i32) -> Option<usize> {',
        '    let (mut lo, mut hi) = (0, items.len());',
        '    while lo < hi {',
        '        let mid = lo + (hi - lo) / 2;',
        '        match items[mid].cmp(&target) {',
        '            std::cmp::Ordering::Equal => return Some(mid),',
        '            std::cmp::Ordering::Less => lo = mid + 1,',
        '            std::cmp::Ordering::Greater => hi = mid,',
        '        }',
        '    }',
        '    None',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-rect',
      title: 'A rectangle',
      code: [
        'struct Rect {',
        '    w: u32,',
        '    h: u32,',
        '}',
        'impl Rect {',
        '    fn area(&self) -> u32 {',
        '        self.w * self.h',
        '    }',
        '    fn is_square(&self) -> bool {',
        '        self.w == self.h',
        '    }',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-even-squares',
      title: 'Sum of even squares',
      code: [
        'fn sum_even_squares(values: &[i64]) -> i64 {',
        '    values',
        '        .iter()',
        '        .filter(|v| *v % 2 == 0)',
        '        .map(|v| v * v)',
        '        .sum()',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-parse-age',
      title: 'Parse with an error enum',
      code: [
        '#[derive(Debug)]',
        'enum ParseError {',
        '    Empty,',
        '    NotANumber,',
        '}',
        'fn parse_age(text: &str) -> Result<u8, ParseError> {',
        '    if text.is_empty() {',
        '        return Err(ParseError::Empty);',
        '    }',
        '    text.parse().map_err(|_| ParseError::NotANumber)',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-gcd',
      title: 'Greatest common divisor',
      code: [
        'fn gcd(a: u64, b: u64) -> u64 {',
        '    if b == 0 {',
        '        a',
        '    } else {',
        '        gcd(b, a % b)',
        '    }',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-count-words',
      title: 'Count words',
      code: [
        'use std::collections::HashMap;',
        'fn count_words(text: &str) -> HashMap<&str, usize> {',
        '    let mut counts = HashMap::new();',
        '    for word in text.split_whitespace() {',
        '        *counts.entry(word).or_insert(0) += 1;',
        '    }',
        '    counts',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-shape-trait',
      title: 'A shape trait',
      code: [
        'trait Shape {',
        '    fn area(&self) -> f64;',
        '}',
        'struct Circle(f64);',
        'impl Shape for Circle {',
        '    fn area(&self) -> f64 {',
        '        std::f64::consts::PI * self.0 * self.0',
        '    }',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-bubble-sort',
      title: 'Bubble sort',
      code: [
        'fn bubble_sort(v: &mut [i32]) {',
        '    let n = v.len();',
        '    for i in 0..n {',
        '        for j in 0..n - i - 1 {',
        '            if v[j] > v[j + 1] {',
        '                v.swap(j, j + 1);',
        '            }',
        '        }',
        '    }',
        '}',
      ].join('\n'),
    },
    {
      id: 'rs-first-even',
      title: 'First even value',
      code: [
        'fn first_even(values: &[u32]) -> Option<u32> {',
        '    let found = values.iter().find(|&&v| v % 2 == 0)?;',
        '    Some(found * 10)',
        '}',
      ].join('\n'),
    },
  ],
  go: [
    {
      id: 'go-fizzbuzz',
      title: 'FizzBuzz',
      code: [
        'import "strconv"',
        'func fizzBuzz(n int) string {',
        '    switch {',
        '    case n%15 == 0:',
        '        return "FizzBuzz"',
        '    case n%3 == 0:',
        '        return "Fizz"',
        '    case n%5 == 0:',
        '        return "Buzz"',
        '    }',
        '    return strconv.Itoa(n)',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-max',
      title: 'Generic maximum',
      code: [
        'func Max[T int | float64](items []T) T {',
        '    if len(items) == 0 {',
        '        return 0',
        '    }',
        '    best := items[0]',
        '    for _, v := range items[1:] {',
        '        if v > best {',
        '            best = v',
        '        }',
        '    }',
        '    return best',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-stack',
      title: 'A stack type',
      code: [
        'type Stack struct {',
        '    items []int',
        '}',
        'func (s *Stack) Push(v int) {',
        '    s.items = append(s.items, v)',
        '}',
        'func (s *Stack) Len() int {',
        '    return len(s.items)',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-word-count',
      title: 'Word count',
      code: [
        'import "strings"',
        'func wordCount(text string) map[string]int {',
        '    counts := make(map[string]int)',
        '    for _, w := range strings.Fields(text) {',
        '        counts[strings.ToLower(w)]++',
        '    }',
        '    return counts',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-generate',
      title: 'Channel generator',
      code: [
        'func generate(n int) <-chan int {',
        '    out := make(chan int)',
        '    go func() {',
        '        defer close(out)',
        '        for i := 0; i < n; i++ {',
        '            out <- i',
        '        }',
        '    }()',
        '    return out',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-parse-port',
      title: 'Parse a port',
      code: [
        'import "fmt"',
        'import "strconv"',
        'func parsePort(s string) (int, error) {',
        '    port, err := strconv.Atoi(s)',
        '    if err != nil {',
        '        return 0, err',
        '    }',
        '    if port < 1 || port > 65535 {',
        '        return 0, fmt.Errorf("port %d out of range", port)',
        '    }',
        '    return port, nil',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-shape',
      title: 'A shape interface',
      code: [
        'type Shape interface {',
        '    Area() float64',
        '}',
        'type Square struct {',
        '    Side float64',
        '}',
        'func (s Square) Area() float64 {',
        '    return s.Side * s.Side',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-reverse',
      title: 'Reverse in place',
      code: [
        'func reverse(nums []int) {',
        '    for i, j := 0, len(nums)-1; i < j; i, j = i+1, j-1 {',
        '        nums[i], nums[j] = nums[j], nums[i]',
        '    }',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-hello-handler',
      title: 'HTTP handler',
      code: [
        'import "fmt"',
        'import "net/http"',
        'func hello(w http.ResponseWriter, r *http.Request) {',
        '    name := r.URL.Query().Get("name")',
        '    if name == "" {',
        '        name = "world"',
        '    }',
        '    fmt.Fprintf(w, "hello, %s", name)',
        '}',
      ].join('\n'),
    },
    {
      id: 'go-sorted-keys',
      title: 'Sorted map keys',
      code: [
        'import "sort"',
        'func sortedKeys(m map[string]int) []string {',
        '    keys := make([]string, 0, len(m))',
        '    for k := range m {',
        '        keys = append(keys, k)',
        '    }',
        '    sort.Strings(keys)',
        '    return keys',
        '}',
      ].join('\n'),
    },
  ],
};

/**
 * Splits code into the words to type. Each line is split on runs of spaces. `breaks[i]` is true when word i
 * is the last on its line (never the final word), and `indent[i]` is the line's leading spaces when word i is
 * the first on its line, else 0. Blank lines are dropped.
 */
export function codeToWords(code: string): { words: string[]; breaks: boolean[]; indent: number[] } {
  const words: string[] = [];
  const breaks: boolean[] = [];
  const indent: number[] = [];
  for (const line of code.split('\n')) {
    const tokens = line.trim().split(/ +/).filter((t) => t.length > 0);
    if (tokens.length === 0) continue;
    const lead = /^ */.exec(line)?.[0].length ?? 0;
    tokens.forEach((token, j) => {
      words.push(token);
      breaks.push(j === tokens.length - 1);
      indent.push(j === 0 ? lead : 0);
    });
  }
  if (breaks.length > 0) breaks[breaks.length - 1] = false;
  return { words, breaks, indent };
}

export interface CodeSelection extends CodeLines {
  words: string[];
  snippet: CodeSnippet;
}

/** A random snippet in the config's code language, with its words and line structure. */
export function codeForConfig(config: Pick<TestConfig, 'codeLanguage'>, rng: Rng = Math.random): CodeSelection {
  const snippet = pick(CODE_SNIPPETS[config.codeLanguage], rng);
  return { snippet, ...codeToWords(snippet.code) };
}

-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
-- Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
--[[
note_filter.lua — theorem environments, numbering and cross-references for
Markdown-sourced math/physics notes. Used by build_note.py; works for both the
LaTeX (PDF) writer and the gfm (clean Markdown) writer, and gives both outputs
identical numbers because the numbers are computed here, not by LaTeX.

Source syntax (Pandoc Markdown):
  ::: {.theorem #thm:main title="Hartogs"}      numbered theorem-like block
  ::: {.remark .unnumbered}                     unnumbered
  ::: {.exercise name="Important Exercise"}     custom printed name
  ::: proof            /  ::: {.proof title="Sketch"}   proof (also .solution)
  $$ E = mc^2 \label{eq:emc} $$                 numbered display equation
  @thm:main  -> "Theorem 2.3"      [-@thm:main] -> "2.3"
  @eq:emc    -> "(2.1)"            @sec:intro   -> "Section 2"
  @thm:main written flush against Chinese text is found too (prefixed ids only).
  (a)/(b) lists: real lists in LaTeX; labels written out in Markdown.
Metadata:
  lang: zh...        Chinese environment names
  numbering: section | global | none   (default: section if there are sections)
  number-sections: false               (turn off section numbers)
]]

local stringify = pandoc.utils.stringify

local STYLE = {
  theorem = 'plain', lemma = 'plain', proposition = 'plain', corollary = 'plain',
  conjecture = 'plain', claim = 'plain', fact = 'plain', principle = 'plain',
  definition = 'def', example = 'def', exercise = 'def', problem = 'def',
  construction = 'def', axiom = 'def', postulate = 'def', notation = 'def',
  question = 'def', convention = 'def', setup = 'def', box = 'def',
  remark = 'remark', note = 'remark', warning = 'remark', heuristic = 'remark',
  caution = 'remark', aside = 'remark',
}
local PROOFLIKE = { proof = true, solution = true }

local NAMES = {
  en = {
    theorem = 'Theorem', lemma = 'Lemma', proposition = 'Proposition',
    corollary = 'Corollary', conjecture = 'Conjecture', claim = 'Claim',
    fact = 'Fact', principle = 'Principle', definition = 'Definition',
    example = 'Example', exercise = 'Exercise', problem = 'Problem',
    construction = 'Construction', axiom = 'Axiom', postulate = 'Postulate',
    notation = 'Notation', question = 'Question', convention = 'Convention',
    setup = 'Setup', box = 'Box', remark = 'Remark', note = 'Note',
    warning = 'Warning', heuristic = 'Heuristic', caution = 'Caution',
    aside = 'Aside', proof = 'Proof', solution = 'Solution',
    section = 'Section', sections = 'Section',
  },
  zh = {
    theorem = '定理', lemma = '引理', proposition = '命题', corollary = '推论',
    conjecture = '猜想', claim = '断言', fact = '事实', principle = '原理',
    definition = '定义', example = '例', exercise = '习题', problem = '问题',
    construction = '构造', axiom = '公理', postulate = '公设', notation = '记号',
    question = '问题', convention = '约定', setup = '设定', box = '框注',
    remark = '注', note = '注记', warning = '警告', heuristic = '启发',
    caution = '注意', aside = '旁注', proof = '证明', solution = '解',
    section = '节', sections = '节',
  },
}

local is_latex = FORMAT:match('latex') ~= nil or FORMAT:match('beamer') ~= nil
local lang = 'en'
local numbering = nil          -- 'section' | 'global' | 'none'
local number_sections = true
local macros = ''              -- \newcommand lines, so titles can use them
local shift_md = false         -- in Markdown, the title is '#', so sections move down

local labels = {}              -- id -> {kind=..., name=..., num=...}
local eqlabels = {}            -- label -> "2.1"
local warnings = {}

local function warn(msg)
  if not warnings[msg] then
    warnings[msg] = true
    io.stderr:write('[note_filter] ' .. msg .. '\n')
  end
end

local function name_of(kind) return NAMES[lang][kind] or NAMES.en[kind] or kind end

local function nbsp() return '\u{A0}' end

local function kind_of(div)
  for _, c in ipairs(div.classes) do
    if STYLE[c] or PROOFLIKE[c] then return c end
  end
  return nil
end

local function has_class(el, c)
  for _, x in ipairs(el.classes) do if x == c then return true end end
  return false
end

-- parse a short Markdown string (attribute value) into inlines
local function md_inlines(s)
  if not s or s == '' then return nil end
  local ok, d = pcall(pandoc.read, macros .. '\n\n' .. s, 'markdown')
  if not ok then return pandoc.Inlines({pandoc.Str(s)}) end
  for _, b in ipairs(d.blocks) do
    if b.t == 'Para' or b.t == 'Plain' then return b.content end
  end
  return pandoc.Inlines({pandoc.Str(s)})
end

local function latex_of_inlines(inl)
  local s = pandoc.write(pandoc.Pandoc({pandoc.Plain(inl)}), 'latex')
  return (s:gsub('%s+$', ''))
end

local function latex_escape_text(s)
  return latex_of_inlines(pandoc.Inlines({pandoc.Str(s)}))
end

---------------------------------------------------------------- pass 1
local sec = {0, 0}
local thm, eq = 0, 0
local has_sections = false

local function prefix()
  if numbering == 'section' and sec[1] > 0 then return tostring(sec[1]) .. '.' end
  return ''
end

local function header_numbered(h)
  return number_sections and h.level <= 2 and not has_class(h, 'unnumbered')
end

local pass1 = {
  traverse = 'topdown',
  Header = function(h)
    if header_numbered(h) then
      if h.level == 1 then
        sec[1] = sec[1] + 1; sec[2] = 0
        if numbering == 'section' then thm = 0; eq = 0 end
      else
        sec[2] = sec[2] + 1
      end
      local num = (h.level == 1) and tostring(sec[1]) or (sec[1] .. '.' .. sec[2])
      h.attributes['data-num'] = num
      if h.identifier ~= '' then
        labels[h.identifier] = {kind = 'section', name = name_of('section'), num = num}
      end
      return h
    end
  end,
  Div = function(div)
    local kind = kind_of(div)
    if not kind or PROOFLIKE[kind] then return nil end
    local num = nil
    if numbering ~= 'none' and not has_class(div, 'unnumbered') then
      thm = thm + 1
      num = prefix() .. thm
      div.attributes['data-num'] = num
    end
    local nm = div.attributes['name'] or name_of(kind)
    if div.identifier ~= '' then
      labels[div.identifier] = {kind = kind, name = nm, num = num}
      if not num then warn('label on unnumbered block: ' .. div.identifier) end
    end
    return div
  end,
  Math = function(m)
    if m.mathtype ~= 'DisplayMath' then return nil end
    local n = 0
    for lab in m.text:gmatch('\\label%s*{([^}]*)}') do
      n = n + 1
      if n == 1 then
        eq = eq + 1
        eqlabels[lab] = prefix() .. eq
      else
        warn('more than one \\label in a display; only the first is numbered: ' .. lab)
      end
    end
  end,
}

---------------------------------------------------------------- pass 2
local function head_text(kind, div)
  local nm = div.attributes['name'] or name_of(kind)
  local num = div.attributes['data-num']
  return nm, num
end

-- LaTeX: close an environment on the last paragraph's own line, so that the
-- proof's QED box sits at the end of the text rather than on a line of its own.
local function close_env(blocks, endtex)
  local last = blocks[#blocks]
  if last and (last.t == 'Para' or last.t == 'Plain') then
    local inl = pandoc.Inlines(last.content)
    inl:insert(pandoc.RawInline('latex', '\n' .. endtex))
    blocks[#blocks] = pandoc.Para(inl)
  else
    blocks:insert(pandoc.RawBlock('latex', endtex))
  end
  return blocks
end

local function make_theorem(div, kind)
  local nm, num = head_text(kind, div)
  local title = md_inlines(div.attributes['title'])
  local style = STYLE[kind]
  if is_latex then
    local head = latex_escape_text(nm) .. (num and ('~' .. num) or '')
    local pre = ''
    if div.identifier ~= '' then pre = '\\phantomsection\\label{' .. div.identifier .. '}' end
    local opt = title and ('[{' .. latex_of_inlines(title) .. '}]') or ''
    local env = 'note' .. style
    local blocks = pandoc.Blocks({pandoc.RawBlock('latex',
      pre .. '\\renewcommand{\\notehead}{' .. head .. '}\\begin{' .. env .. '}' .. opt)})
    local c1 = div.content[1]
    if c1 and (c1.t == 'OrderedList' or c1.t == 'BulletList' or c1.t == 'DefinitionList') then
      -- otherwise the first item lands on the heading line
      blocks:insert(pandoc.RawBlock('latex', '\\leavevmode'))
    end
    blocks:extend(div.content)
    return close_env(blocks, '\\end{' .. env .. '}')
  end
  -- Markdown: > **Theorem 2.3** (Title). body
  local headinl = pandoc.Inlines({pandoc.Strong({pandoc.Str(nm .. (num and (nbsp() .. num) or ''))})})
  if title then
    if lang == 'zh' then
      headinl:insert(pandoc.Str('（')); headinl:extend(title); headinl:insert(pandoc.Str('）'))
    else
      headinl:insert(pandoc.Space()); headinl:insert(pandoc.Str('('))
      headinl:extend(title); headinl:insert(pandoc.Str(')'))
    end
  end
  if lang ~= 'zh' then headinl:insert(pandoc.Str('.')) end
  local content = pandoc.Blocks(div.content)
  if #content > 0 and (content[1].t == 'Para' or content[1].t == 'Plain') then
    local first = pandoc.Inlines(headinl)
    first:insert(pandoc.Space())
    first:extend(content[1].content)
    content[1] = pandoc.Para(first)
  else
    content:insert(1, pandoc.Para(headinl))
  end
  return pandoc.Blocks({pandoc.BlockQuote(content)})
end

local function make_proof(div, kind)
  local title = md_inlines(div.attributes['title'])
  if is_latex then
    local opt = ''
    if title then
      opt = '[{' .. latex_of_inlines(title) .. '}]'
    elseif kind == 'solution' then
      opt = '[{' .. latex_escape_text(name_of('solution')) .. '}]'
    end
    local blocks = pandoc.Blocks({pandoc.RawBlock('latex', '\\begin{proof}' .. opt)})
    blocks:extend(div.content)
    return close_env(blocks, '\\end{proof}')
  end
  local headinl
  if lang == 'zh' then
    headinl = pandoc.Inlines({pandoc.Strong(title or {pandoc.Str(name_of(kind))})})
  else
    headinl = pandoc.Inlines({pandoc.Emph(title or {pandoc.Str(name_of(kind))})})
    headinl:insert(pandoc.Str('.'))
  end
  local content = pandoc.Blocks(div.content)
  if #content > 0 and (content[1].t == 'Para' or content[1].t == 'Plain') then
    local first = pandoc.Inlines(headinl)
    first:insert(pandoc.Space())
    first:extend(content[1].content)
    content[1] = pandoc.Para(first)
  else
    content:insert(1, pandoc.Para(headinl))
  end
  local last = content[#content]
  if last.t == 'Para' or last.t == 'Plain' then
    local inl = pandoc.Inlines(last.content)
    inl:insert(pandoc.Space()); inl:insert(pandoc.Str('∎'))
    content[#content] = pandoc.Para(inl)
  else
    content:insert(pandoc.Para({pandoc.Str('∎')}))
  end
  return content
end

local function ref_inlines(id, mode)
  local eqn = eqlabels[id]
  if eqn then
    if is_latex then
      return pandoc.Inlines({pandoc.RawInline('latex', '\\hyperref[' .. id .. ']{(' .. eqn .. ')}')})
    end
    return pandoc.Inlines({pandoc.Str('(' .. eqn .. ')')})
  end
  local L = labels[id]
  if not L then return nil end
  local num = L.num or '??'
  local text
  if mode == 'SuppressAuthor' then
    text = num
  elseif L.kind == 'section' and lang == 'zh' then
    text = '第' .. nbsp() .. num .. nbsp() .. '节'
  elseif L.kind == 'section' then
    text = 'Section' .. nbsp() .. num
  else
    text = L.name .. nbsp() .. num
  end
  if is_latex then
    local t = latex_escape_text(text)
    return pandoc.Inlines({pandoc.RawInline('latex', '\\hyperref[' .. id .. ']{' .. t .. '}')})
  end
  return pandoc.Inlines({pandoc.Str(text)})
end

local LABEL_PREFIX = { 'thm', 'lem', 'prop', 'cor', 'def', 'ex', 'rem', 'eq', 'ax', 'conv',
  'heur', 'prin', 'sol', 'warn', 'note', 'setup',
  'sec', 'conj', 'exr', 'prob', 'claim', 'fact', 'box', 'nota', 'constr', 'q' }

local function looks_like_label(id)
  local p = id:match('^([%a]+):')
  if not p then return false end
  for _, x in ipairs(LABEL_PREFIX) do if x == p then return true end end
  return false
end

local function split_display(p)
  -- Markdown only: put each display equation in its own paragraph, so that
  -- $$ ... $$ sits on its own lines (needed by GitHub/Obsidian/Typora).
  local out, cur, found = pandoc.Blocks({}), pandoc.Inlines({}), false
  local function flush()
    while #cur > 0 and (cur[#cur].t == 'Space' or cur[#cur].t == 'SoftBreak') do cur:remove(#cur) end
    while #cur > 0 and (cur[1].t == 'Space' or cur[1].t == 'SoftBreak') do cur:remove(1) end
    if #cur > 0 then out:insert(pandoc.Para(cur)) end
    cur = pandoc.Inlines({})
  end
  for _, x in ipairs(p.content) do
    if x.t == 'Math' and x.mathtype == 'DisplayMath' then
      found = true
      flush()
      out:insert(pandoc.Para({x}))
    else
      cur:insert(x)
    end
  end
  flush()
  if found then return out end
  return nil
end

local function roman(n)
  local vals = {{1000,'m'},{900,'cm'},{500,'d'},{400,'cd'},{100,'c'},{90,'xc'},
                {50,'l'},{40,'xl'},{10,'x'},{9,'ix'},{5,'v'},{4,'iv'},{1,'i'}}
  local out = ''
  for _, v in ipairs(vals) do while n >= v[1] do out = out .. v[2]; n = n - v[1] end end
  return out
end

local function list_label(style, n)
  if style == 'LowerAlpha' then return string.char(96 + ((n - 1) % 26) + 1) end
  if style == 'UpperAlpha' then return string.char(64 + ((n - 1) % 26) + 1) end
  if style == 'LowerRoman' then return roman(n) end
  if style == 'UpperRoman' then return roman(n):upper() end
  return tostring(n)
end

-- scan plain text for @prefix:label (e.g. flush against Chinese text, where
-- Pandoc does not recognise a citation) and resolve it
local function scan_str(s)
  local text = s.text
  if not text:find('@', 1, true) then return nil end
  local out, pos, changed = pandoc.Inlines({}), 1, false
  while true do
    local a, b, id = text:find('@([%a]+:[%w_%-%.:]+)', pos)
    if not a then break end
    local trimmed = id:gsub('[%.:%-]+$', '')
    if looks_like_label(trimmed) then
      if a > pos then out:insert(pandoc.Str(text:sub(pos, a - 1))) end
      local r = ref_inlines(trimmed, 'AuthorInText')
      if r then out:extend(r) else
        warn('unresolved reference: @' .. trimmed)
        out:insert(pandoc.Str('@' .. trimmed))
      end
      changed = true
      pos = a + #trimmed + 1
    else
      out:insert(pandoc.Str(text:sub(pos, b)))
      pos = b + 1
    end
  end
  if not changed then return nil end
  if pos <= #text then out:insert(pandoc.Str(text:sub(pos))) end
  return out
end

local pass2 = {
  Str = scan_str,
  OrderedList = function(ol)
    -- Markdown has no (a)/(i) lists: write the labels out, so "(b)" in the text
    -- still matches. LaTeX keeps the real list.
    if is_latex then return nil end
    local style, delim = ol.style, ol.delimiter
    if style ~= 'LowerAlpha' and style ~= 'UpperAlpha' and style ~= 'LowerRoman'
       and style ~= 'UpperRoman' then return nil end
    local out = pandoc.Blocks({})
    for i, item in ipairs(ol.content) do
      local lab = list_label(style, (ol.start or 1) + i - 1)
      if delim == 'TwoParens' then lab = '(' .. lab .. ')'
      elseif delim == 'OneParen' then lab = lab .. ')'
      else lab = lab .. '.' end
      local blocks = pandoc.Blocks(item)
      if blocks[1] and (blocks[1].t == 'Para' or blocks[1].t == 'Plain') then
        local inl = pandoc.Inlines({pandoc.Str(lab), pandoc.Space()})
        inl:extend(blocks[1].content)
        blocks[1] = pandoc.Para(inl)
      else
        blocks:insert(1, pandoc.Para({pandoc.Str(lab)}))
      end
      out:extend(blocks)
    end
    return out
  end,
  Para = function(p)
    if is_latex then return nil end
    return split_display(p)
  end,
  Header = function(h)
    local num = h.attributes['data-num']
    h.attributes['data-num'] = nil
    if num and not is_latex then
      local c = pandoc.Inlines({pandoc.Str(num), pandoc.Space()})
      c:extend(h.content)
      h.content = c
    end
    if shift_md and not is_latex then h.level = math.min(h.level + 1, 6) end
    return h
  end,
  Div = function(div)
    local kind = kind_of(div)
    if not kind then return nil end
    if PROOFLIKE[kind] then return make_proof(div, kind) end
    return make_theorem(div, kind)
  end,
  Math = function(m)
    if m.mathtype ~= 'DisplayMath' then return nil end
    local first = true
    local text = m.text:gsub('\\label%s*{([^}]*)}', function(lab)
      if first and eqlabels[lab] then
        first = false
        if is_latex then return '\\tag{' .. eqlabels[lab] .. '}\\label{' .. lab .. '}' end
        return '\\tag{' .. eqlabels[lab] .. '}'
      end
      return ''
    end)
    m.text = text
    return m
  end,
  Cite = function(c)
    local out = pandoc.Inlines({})
    local all = true
    for i, cit in ipairs(c.citations) do
      local r = ref_inlines(cit.id, cit.mode)
      if r then
        if i > 1 then out:insert(pandoc.Str(',')); out:insert(pandoc.Space()) end
        out:extend(r)
      else
        all = false
        if looks_like_label(cit.id) then warn('unresolved reference: @' .. cit.id) end
      end
    end
    if all then return out end
    return nil
  end,
  RawBlock = function(rb)
    if is_latex then return nil end
    if rb.format == 'tex' or rb.format == 'latex' then
      if rb.text:match('^%s*\\[re]*newcommand') or rb.text:match('^%s*\\DeclareMathOperator')
         or rb.text:match('^%s*\\def') then
        return {}  -- macro definitions: already expanded into the math
      end
      local note = (lang == 'zh') and '（此处为 LaTeX 图示，见 PDF）' or '(LaTeX-only content; see the PDF)'
      return pandoc.Blocks({pandoc.Para({pandoc.Emph({pandoc.Str(note)})}),
                            pandoc.CodeBlock(rb.text, {class = 'latex'})})
    end
  end,
}

function Pandoc(doc)
  local m = doc.meta
  shift_md = m.title ~= nil
  local L = m['note-lang'] or m.lang
  if L and stringify(L):match('^zh') then lang = 'zh' end
  if m['number-sections'] ~= nil and stringify(m['number-sections']) == 'false' then
    number_sections = false
  end
  for _, b in ipairs(doc.blocks) do
    if b.t == 'Header' and b.level == 1 and not has_class(b, 'unnumbered') then
      has_sections = true
    end
    if b.t == 'RawBlock' and (b.format == 'tex' or b.format == 'latex') and
       (b.text:match('newcommand') or b.text:match('DeclareMathOperator')) then
      macros = macros .. b.text .. '\n'
    end
  end
  numbering = m.numbering and stringify(m.numbering) or nil
  if numbering ~= 'section' and numbering ~= 'global' and numbering ~= 'none' then
    numbering = (has_sections and number_sections) and 'section' or 'global'
  end
  if not number_sections and numbering == 'section' then numbering = 'global' end

  doc = doc:walk(pass1)
  doc = doc:walk(pass2)
  return doc
end

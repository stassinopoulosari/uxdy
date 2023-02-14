import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.36-alpha/deno-dom-wasm.ts'

const TERM = 'SP23'

function unwrap (expected?: Error): never {
  throw expected ?? new RangeError('Expected non-nullish value')
}

const parser = new DOMParser()
const fetchHtml = (url: string) =>
  fetch(url)
    .then(r =>
      r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status} error`))
    )
    .then(
      html =>
        parser.parseFromString(html, 'text/html') ??
        Promise.reject(new SyntaxError('DOM parse error (document is null)'))
    )

/** Represents a scheduled meeting time for a course. */
type Section = {
  /**
   * Only defined if the section is selectable in WebReg (eg a discussion time
   * as opposed to its lecture). A 6-digit number.
   */
  id?: number
  /** eg LE, DI, LA */
  type: string
  /**
   * Date if it's an exam (eg a final) that occurs on one day. Otherwise, it's a
   * section code like A00 or 001.
   */
  section: string | Date
  /** Undefined if TBA. */
  time?: {
    /** Array of numbers 1-7 representing days of the week. */
    days: number[]
    /** In minutes since the start of the day. */
    start: number
    /** In minutes since the start of the day. */
    end: number
  }
  /** Undefined if TBA. */
  location?: {
    building: string
    room: string
  }
  /** Undefined if staff. */
  instructor?: [firstName: string, lastName: string]
  available: number
  capacity: number
}

type Course = {
  subject: string
  number: string
  title: string
  units: number
  sections: Section[]
}

const getUrl = (term: string, subjects: string[], page: number) =>
  'https://act.ucsd.edu/scheduleOfClasses/scheduleOfClassesStudentResult.htm?' +
  new URLSearchParams([
    ['selectedTerm', term],
    ...subjects.map(subject => ['selectedSubjects', subject]),
    ['page', String(page)]
  ])

type SubjectList = {
  code: string
  value: string
}[]
const subjects = await fetch(
  'https://act.ucsd.edu/scheduleOfClasses/subject-list.json?selectedTerm=' +
    TERM
)
  .then(r => r.json())
  .then((json: SubjectList) => json.map(({ code }) => code))

let maxPage: number | null = null
let page = 1
while (maxPage === null || page <= maxPage) {
  const document = await fetchHtml(getUrl(TERM, subjects, page))
  const form =
    document.getElementById('socDisplayCVO') ??
    unwrap(new Error('Missing results wrapper'))
  if (maxPage === null) {
    const [, maxPageStr] =
      form.children[6]
        .querySelector('td[align="right"]')
        ?.textContent.match(/\(\d+\sof\s(\d+)\)/) ??
      unwrap(new Error('Missing total page count'))
    maxPage = +maxPageStr
  }

  const rows =
    form.querySelector('.tbrdr')?.children[1].children ??
    unwrap(new Error('Missing results table'))
  let subject = ''
  for (const row of rows) {
    // Heading with subject code
    const subjectHeading = row.querySelector('h2')
    if (subjectHeading) {
      const match = subjectHeading.textContent.match(/\(([A-Z]+)\s*\)/)
      if (match) {
        subject = match[1]
      }
      continue
    }

    // Row with course title and units
    if (row.querySelector('.crsheader') && row.children.length === 4) {
      const code = +row.children[1].textContent
      const unitMatch =
        row.children[2].textContent.match(/\(\s*(\d+)\s+Units\)/) ??
        unwrap(
          new SyntaxError('Missing "(N units)"\n' + row.children[2].textContent)
        )
      const units = +unitMatch[1]
      console.log(subject, code, units)
      // TODO: unit ranges
      continue
    }
  }

  page++
  break
}

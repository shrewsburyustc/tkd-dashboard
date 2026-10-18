// TestingSkeleton.jsx — gray placeholder bars while a school's list loads for the first time.
// Why it exists: guidelines 3.4 — a page shows content or a gray "skeleton" within 1 second,
// never a blank screen. Seven bars, the height of the class lines (7 classes is the usual
// list). Screen readers hear "Loading Classes and ranks" instead of seven empty boxes.
import { LOADING } from './text.js';

const BAR_COUNT = 7;

export default function TestingSkeleton() {
  return (
    // aria-busy="true" tells screen readers this area is still being filled in.
    <div className="clist tskeleton" aria-busy="true">
      <span className="visually-hidden">{LOADING}</span>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <div key={index} className="tskeleton-row" aria-hidden="true">
          <span className="tskeleton-bar" />
        </div>
      ))}
    </div>
  );
}

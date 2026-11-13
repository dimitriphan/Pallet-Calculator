/**
 * How the view of the selected layout is kept while the editor's view covers it: invisible,
 * not removed (it keeps its size), and hidden from assistive technology so that nothing in it
 * is read or reached. Its own module so the rule can be tested without a 3D canvas.
 */
export function hiddenSceneProps(hidden: boolean): {
  className: string;
  'aria-hidden'?: 'true';
} {
  return hidden ? { className: 'invisible', 'aria-hidden': 'true' } : { className: '' };
}

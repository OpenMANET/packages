Holds original source files to generate diagram SVGs.

Steps:

- create a drawio diagram
  (stored in repo)
- export this as an SVG using the svgdata plugin to
  retain group/slot attributes
  (intermediate state; not in repo)
- convert this SVG using the Python script to one
  in the correct format for an HTML template
  (stored in repo in final location)

See convert_drawio_svg_to_our_svg.py for details on the process.

Why do we want this? So we can easily 'template' our SVGs, allowing
us to insert textual HTML elements (via slots) and enable
and disable various groups of objects (identified by id).

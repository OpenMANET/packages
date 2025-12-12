"""
Postprocess a draw.io exported svg based on the data-* attributes.

For more information on why you'd want this, see README.md.

The SVG that's exported from draw.io doesn't preserve groups
(instead, the whole layout is a single group). However, if we
use the svgdata plugin, we can add data attributes ('Edit Data...')
which are export to SVG as data-* custom attributes.

To run this, load the svgdata drawio plugin (you may need to restart
drawio), load the template.drawio file in this directory,
then export as an SVG. Be aware that it has considerable trouble
actually using the plugin; in my experience, it _only_ works on the
initial restart. Symptoms of it not working are no 'data-' attributes
in the output, and that our post-processing script won't find any
groups/slots.

Running the post-processing on the draw.io svg file:

  python convert_drawio_svg_to_our_svg.py template-Template.drawio.svg > template.svg

This takes an SVG full of undifferentiated elements
and uses data-groups attributes to identify groups (and hides them)
and data-slot attributes to identify slots (and empties them).
data-group attributes are usually on the graphical elements, and data-slot
attributes are on the HTML/text elements.

More specifically, we:
- removes the top-level group
- for every data-group attribute, use this to form a group
  and set display:none on the group
- for every data-slot attribute, use this directly
  _and_ if there's a rect as the first child, set its id
  based on this (<id>_SELECT) and set it to display:none.
  Then, find a foreign object child
  that has an html document and replace the contents with a slot.

This allows us to have a webcomponent like:

<morse-config-diagram show-AP_SELECT show-AP_MGMT_ETH>
    <b slot="AP_MGMT_ETH_INT">eth0 (10.42.0.1)</b>
</morse-config-diagram>

(see morse-config-diagram.js)
"""

import xml.dom.minidom


def make_slots(doc):
    """Process all data-slot marked elements and set their id.

    These are the elements which we want to be able to use slots
    in via HTML templates. We look inside the element for a text
    string corresponding to the name of the data-slot
    (e.g. the data-slot attribute MUST align with the text string
    inside; this text string will be removed and is where
    the actual slot is placed).

    Most of these elements are inside boxes, in which case
    we also hide the boxes and label them as
    <id>_SELECT and <id>_SELECT_FILL.

    This is fairly fragile, as we rely heavily on the
    exact form of the drawio output.
    """
    for element in doc.getElementsByTagName('*'):
        if not element.hasAttribute('data-slot'):
            continue

        slot_name = element.getAttribute('data-slot')
        element.setAttribute('id', slot_name)
        element.setIdAttribute('id')
        # If we have a rectangle inside our group and there are only two elements,
        # we guess this is a 'select' box and give it an id (<id>_SELECT) and set display none.
        if element.childNodes.length == 2 and element.firstChild.tagName == 'rect':
            element.firstChild.setAttribute('style', 'display: none')
            element.firstChild.setAttribute('id', f'{slot_name}_SELECT')

        # This is probably a 'sketch' box; handle the fill separately.
        # The first node is a rect but it has zero stroke width and no fill.
        sketchbox = element.childNodes.length == 4 and element.firstChild.tagName == 'rect'
        if sketchbox:
            fillElement = element.childNodes[1]
            fillElement.setAttribute('style', 'display: none')
            fillElement.setAttribute('id', f'{slot_name}_SELECT_FILL')
            fillElement.setIdAttribute('id')
            rectElement = element.childNodes[2]
            rectElement.setAttribute('style', 'display: none')
            rectElement.setAttribute('id', f'{slot_name}_SELECT')
            rectElement.setIdAttribute('id')

        for html_element in element.getElementsByTagName('foreignObject'):
            # Fragile and messy, here, relying on exactly
            # what drawio currently outputs.
            parent_div = html_element.firstChild.firstChild
            assert parent_div.tagName == 'div'
            container_div = parent_div.firstChild
            assert container_div.tagName == 'div'

            if sketchbox:
                # We want to avoid overflowing the sketchbox, otherwise it'll look ugly.
                # Also, the sketchbox elements are most dynamic programmatically generated
                # ones, so we _will_ generate too much text.
                parent_div.setAttribute('style', parent_div.getAttribute('style') + """
                    width: inherit;
                """)

                # max-height protects us against vertical overflow. Unfortunately, I don't think
                # there's a clean way to do this, so we instead just cap ourselves at ~3 lines
                # (line-height: 1.2 is the default, but we re-specify to avoid the upstream
                # diagram settings interfering).
                # display:block is added to stop some weirdness with the parent element expanding
                # (rendering whitespace?). Since we should only have one element here, inline-block
                # is superfluous.
                container_div.setAttribute('style', container_div.getAttribute('style') + """
                    display: block;
                    overflow: hidden;
                    width: inherit;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    line-height: 1.2;
                    max-height: 3.6em;
                """)

            # If the diagram author has put text formatting into the div, there
            # may be additional elements here that we need to preserve, so we
            # keep hunting for the actual _text_ of the slot_name. This also guarantees
            # that the slot name text and the data-slot attribute are in sync.
            slot_container = container_div
            while slot_container.firstChild.nodeValue != slot_name:
                slot_container = slot_container.firstChild
                assert slot_container.firstChild, f"data-slot attribute '{slot_name}' missing equal text"

            while slot_container.hasChildNodes():
                slot_container.removeChild(slot_container.firstChild)
            slot = doc.createElement('slot')
            slot.setAttribute('name', slot_name)
            slot_container.appendChild(slot)


def make_groups(doc):
    """Group elements by 'data-group' attribute (and set id).

    This is much simpler than slots, and we mostly just create hidden
    groups and put all matching elements in them.

    However, there is special handling for sketch styled boxes,
    where we identify a separate _FILL element (so we can
    hide/show this element separately).
    """
    groups = {}
    for element in doc.getElementsByTagName('*'):
        if element.hasAttribute('data-group'):
            group_id = element.getAttribute('data-group')
            if group_id not in groups:
                groups[group_id] = doc.createElement('g')
                groups[group_id].setAttribute('style', 'display: none')
                groups[group_id].setAttribute('id', group_id)
                groups[group_id].setIdAttribute('id')
                existing = element
                # To avoid messing up the ordering of elements, which determines
                # which element is on top of which other, we need to insert
                # the element where the existing one (or its direct ancestor)
                # is in the document.
                while existing.parentNode != doc.documentElement:
                    existing = existing.parentNode
                doc.documentElement.insertBefore(groups[group_id], existing)

            # Looks like a sketch box. Let's create a separate id for the fill and hide it by default.
            if element.tagName == 'g' and element.childNodes.length == 3 and element.firstChild.tagName == 'rect':
                fillElement = element.childNodes[1]
                fillElement.setAttribute('id', f'{group_id}_FILL')
                fillElement.setAttribute('style', 'display: none')
                fillElement.setIdAttribute('id')

            # I believe this also makes them lose their existing place in the document
            # (i.e. effectively deleting them from the DOM).
            groups[group_id].appendChild(element)


def simplify(doc):
    """Clean up document top-level"""
    # We expect a top-level switch (containing some error text) and
    # a group containing all our actual elements.
    assert doc.documentElement.childNodes.length == 3
    group = doc.documentElement.childNodes[1]
    assert group.tagName == 'g'
    switch = doc.documentElement.childNodes[2]
    assert switch.tagName == 'switch'

    # Remove the switch error text.
    doc.documentElement.removeChild(switch)

    # Remove the group and move its elements.
    doc.documentElement.removeChild(group)
    for element in list(group.childNodes):
        doc.documentElement.appendChild(element)

    # Remove width/height so it scales when put in browser.
    doc.documentElement.removeAttribute('width')
    doc.documentElement.removeAttribute('height')


if __name__ == '__main__':
    import sys
    doc = xml.dom.minidom.parse(sys.argv[1])
    simplify(doc)
    make_slots(doc)
    make_groups(doc)

    doc.writexml(sys.stdout, indent='  ', addindent='  ', newl='\n')


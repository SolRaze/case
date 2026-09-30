laptop

MS-16W1 mainboard | GF65 Thin 10SER | measured from two photos on a SKÅDIS pegboard, not calipered | 1 unit = 1 mm

files
- ms-16w1.json | board outline, stack heights, ports, fans, shield, accuracy per value
- board-ortho.json | panel frame, 10 fitted edges, 51 shield openings, heatsink-side extents

findings
- length 352.2 | heatsink face to port-edge PCB | +/-3
- width 156.9 | PCB edge to PCB edge | +/-1.5
- heatsink overhang past PCB 3.5
- M.2 protrusion 74.0 | two 2280 cards past the PCB edge, unsupported, the enclosure carries their screw ends
- shield 306.1 x 116.4 | face 11.4 +/-1.6 off the panel
- stack 8.0 heatsink side | 3.0 shield side | PCB 1.2 assumed | derived, not measured
- grid fit | front 52 slots 1.66 px rms | oblique 34 slots 2.00 px rms
- heatsink edge worst residual | +Y 0.7 px | -Y 0.6 | +X 1.1 | -X 5.3, noisy from the ports, uses the +X line direction
- SO-DIMM 70.4 against 69.6 nominal
- rerun reproduces every value | true-scale images byte-identical to the stored ones

open
- GPU fan PAAD06015SL N433 missing from the bay
- unconfirmed PCB step about 6.7 x 11.5 near local (159.6, -51.1), not in the outline
- caliper check of length, width and stack

source
- skadis-measure.py in the cad repo, from the two source photos | photos and images not in this repo

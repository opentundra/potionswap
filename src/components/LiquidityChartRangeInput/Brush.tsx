import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrushBehavior, brushX, D3BrushEvent, local, ScaleLinear, select } from 'd3'
import styled from 'styled-components/macro'
import { brushHandleAccentPath, brushHandlePath, caretPath } from 'components/LiquidityChartRangeInput/svg'
import usePrevious from 'hooks/usePrevious'

const Handle = styled.path<{ color: string }>`
  cursor: ew-resize;
  pointer-events: none;

  stroke-width: 4;
  stroke: ${({ color }) => color};
  fill: ${({ color }) => color};
`

const HandleAccent = styled.path`
  cursor: ew-resize;
  pointer-events: none;

  stroke-width: 1.5;
  stroke: ${({ theme }) => theme.white};
  opacity: 0.6;
`

const OutOfViewIndicator = styled.path`
  stroke: ${({ theme }) => theme.primaryText1};
  stroke-width: 4;
  fill: transparent;
  cursor: zoom-out;
`

const LabelGroup = styled.g<{ visible: boolean }>`
  opacity: ${({ visible }) => (visible ? '1' : '0')};
  transition: opacity 300ms;
`

const TooltipBackground = styled.rect`
  fill: ${({ theme }) => theme.bg2};
`

const Tooltip = styled.text`
  text-anchor: middle;
  font-size: 13px;
  fill: ${({ theme }) => theme.text1};
`

// flips the handles draggers when close to the container edges
const FLIP_HANDLE_THRESHOLD_PX = 20

const compare = (a1: [number, number], a2: [number, number]): boolean => a1[0] !== a2[0] || a1[1] !== a2[1]

export const Brush = ({
  id,
  xScale,
  interactive,
  brushLabelValue,
  brushExtent,
  setBrushExtent,
  innerWidth,
  innerHeight,
  westHandleColor,
  eastHandleColor,
  resetZoom,
}: {
  id: string
  xScale: ScaleLinear<number, number>
  interactive: boolean
  brushLabelValue: (d: 'w' | 'e', x: number) => string
  brushExtent: [number, number]
  setBrushExtent: (extent: [number, number]) => void
  innerWidth: number
  innerHeight: number
  westHandleColor: string
  eastHandleColor: string
  resetZoom: () => void
}) => {
  const brushRef = useRef<SVGGElement | null>(null)
  const brushBehavior = useRef<BrushBehavior<SVGGElement> | null>(null)

  // only used to drag the handles on brush for performance
  const [localBrushExtent, setLocalBrushExtent] = useState<[number, number] | null>(brushExtent)
  const [showLabels, setShowLabels] = useState(false)
  const [hovering, setHovering] = useState(false)

  const previousBrushExtent = usePrevious(brushExtent)

  const brushed = useCallback(
    ({ type, selection }: D3BrushEvent<unknown>) => {
      if (!selection) {
        setLocalBrushExtent(null)
        return
      }

      const scaled = (selection as [number, number]).map(xScale.invert) as [number, number]

      // avoid infinite render loop by checking for change
      if (type === 'end' && compare(brushExtent, scaled)) {
        setBrushExtent(scaled)
      }

      setLocalBrushExtent(scaled)
    },
    [xScale, brushExtent, setBrushExtent]
  )

  // keep local and external brush extent in sync
  // i.e. snap to ticks on bruhs end
  useEffect(() => {
    setLocalBrushExtent(brushExtent)
  }, [brushExtent])

  // initialize the brush
  useEffect(() => {
    if (!brushRef.current) return

    brushBehavior.current = brushX<SVGGElement>()
      .extent([
        [Math.max(0, xScale(0)), 0],
        [innerWidth, innerHeight],
      ])
      .handleSize(30)
      .filter(() => interactive)
      .on('brush end', brushed)

    brushBehavior.current(select(brushRef.current))

    if (previousBrushExtent && compare(brushExtent, previousBrushExtent)) {
      select(brushRef.current)
        .transition()
        .call(brushBehavior.current.move as any, brushExtent.map(xScale))
    }

    // brush linear gradient
    select(brushRef.current)
      .selectAll('.selection')
      .attr('stroke', 'none')
      .attr('fill-opacity', '0.1')
      .attr('fill', `url(#${id}-gradient-selection)`)
  }, [brushExtent, brushed, id, innerHeight, innerWidth, interactive, previousBrushExtent, xScale])

  // respond to xScale changes only
  useEffect(() => {
    if (!brushRef.current || !brushBehavior.current) return

    brushBehavior.current.move(select(brushRef.current) as any, brushExtent.map(xScale) as any)
  }, [brushExtent, xScale])

  useEffect(() => {
    setShowLabels(true)
    const timeout = setTimeout(() => setShowLabels(false), 1500)
    return () => clearTimeout(timeout)
  }, [localBrushExtent])

  const flipWestHandle = localBrushExtent && xScale(localBrushExtent[0]) > FLIP_HANDLE_THRESHOLD_PX
  const flipEastHandle = localBrushExtent && xScale(localBrushExtent[1]) > innerWidth - FLIP_HANDLE_THRESHOLD_PX

  return useMemo(
    () => (
      <>
        <defs>
          <linearGradient id={`${id}-gradient-selection`} x1="0%" y1="100%" x2="100%" y2="100%">
            <stop stopColor={westHandleColor} />
            <stop stopColor={eastHandleColor} offset="1" />
          </linearGradient>

          {/* clips at exactly the svg area */}
          <clipPath id={`${id}-brush-clip`}>
            <rect x="0" y="0" width={innerWidth} height="100%" />
          </clipPath>

          <clipPath id={`${id}-handles-clip`}>
            <rect x="0" y="0" width="100%" height="100%" />
          </clipPath>
        </defs>

        {/* will host the d3 brush */}
        <g
          ref={brushRef}
          clipPath={`url(#${id}-brush-clip)`}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        />

        {/* custom brush handles */}
        {localBrushExtent && (
          <>
            {/* west handle */}
            {xScale(localBrushExtent[0]) >= 0 ? (
              <g transform={`translate(${xScale(localBrushExtent[0])}, 0), scale(${flipWestHandle ? '-1' : '1'}, 1)`}>
                <g>
                  <Handle color={westHandleColor} d={brushHandlePath(innerHeight)} />
                  <HandleAccent d={brushHandleAccentPath()} />
                </g>

                <LabelGroup
                  transform={`translate(50,0), scale(${flipWestHandle ? '1' : '-1'}, 1)`}
                  visible={showLabels || hovering}
                >
                  <TooltipBackground y="0" x="-30" height="30" width="60" rx="8" />
                  <Tooltip transform={`scale(-1, 1)`} y="15" dominantBaseline="middle">
                    {brushLabelValue('w', localBrushExtent[0])}
                  </Tooltip>
                </LabelGroup>
              </g>
            ) : (
              /* show out of view indicator */
              <OutOfViewIndicator d={caretPath(innerHeight)} onClick={resetZoom} />
            )}

            {/* east handle */}
            {xScale(localBrushExtent[1]) <= innerWidth ? (
              <g transform={`translate(${xScale(localBrushExtent[1])}, 0), scale(${flipEastHandle ? '-1' : '1'}, 1)`}>
                <g clipPath={`url(#${id}-handles-clip)`}>
                  <Handle color={eastHandleColor} d={brushHandlePath(innerHeight)} />
                  <HandleAccent d={brushHandleAccentPath()} />
                </g>

                <LabelGroup
                  transform={`translate(50,0), scale(${flipEastHandle ? '-1' : '1'}, 1)`}
                  visible={showLabels || hovering}
                >
                  <TooltipBackground y="0" x="-30" height="30" width="60" rx="8" />
                  <Tooltip y="15" dominantBaseline="middle">
                    {brushLabelValue('e', localBrushExtent[1])}
                  </Tooltip>
                </LabelGroup>
              </g>
            ) : (
              /* show out of view indicator */
              <OutOfViewIndicator
                d={caretPath(innerHeight)}
                transform={`translate(${innerWidth}, 0) scale(-1, 1)`}
                onClick={() => resetZoom()}
              />
            )}
          </>
        )}
      </>
    ),
    [
      brushLabelValue,
      eastHandleColor,
      flipEastHandle,
      flipWestHandle,
      hovering,
      id,
      innerHeight,
      innerWidth,
      localBrushExtent,
      resetZoom,
      showLabels,
      westHandleColor,
      xScale,
    ]
  )
}

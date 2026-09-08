import React, { memo } from 'react'

function SkeletonState() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton__shimmer" />
      <div className="skeleton__body">
        <div className="skeleton__title" />
        <div className="skeleton__text" />
        <div className="skeleton__actions">
          <div className="skeleton__btn" />
          <div className="skeleton__btn" />
        </div>
      </div>
    </div>
  )
}

export default memo(SkeletonState)

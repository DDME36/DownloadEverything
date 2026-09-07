import React from 'react'

export default function SkeletonState() {
  return (
    <div className="skeleton">
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

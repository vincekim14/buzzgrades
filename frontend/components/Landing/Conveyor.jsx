import React from "react";
import styles from "./Conveyor.module.css";

const icons = [
  "/images/buzz_sting_icon.png",
  "/images/buzz_standing_icon.png",
  "/images/buzz_car_icon.png",
  "/images/buzz_sting_icon.png",
  "/images/buzz_standing_icon.png",
  "/images/buzz_car_icon.png",
];

const Conveyor = ({ inline = false }) => {
  const rootClass = inline ? styles.inlineRoot : styles.conveyorRoot;
  if (inline) {
    return (
      <div className={rootClass} aria-hidden>
        <div className={styles.inlineTrack}>
          <div className={styles.inlineScroller}>
            <div className={styles.inlineRow}>
              {icons.map((src) => (
                <img key={`a:${src}`} className={styles.icon} src={src} alt="" />
              ))}
              {icons.map((src) => (
                <img key={`b:${src}`} className={styles.icon} src={src} alt="" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={rootClass} aria-hidden>
      <div className={styles.trackWrap}>
        <div className={styles.scroller}>
          <div className={styles.row}>
            {icons.map((src) => (
              <img key={`a:${src}`} className={styles.icon} src={src} alt="" />
            ))}
            {icons.map((src) => (
              <img key={`b:${src}`} className={styles.icon} src={src} alt="" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Conveyor;


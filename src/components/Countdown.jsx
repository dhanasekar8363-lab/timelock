import { useEffect, useState } from "react";

function Countdown({ targetDate }) {

  const calculateTime = () => {

    const difference =
      new Date(targetDate) - new Date();

    if (difference <= 0)
      return null;

    return {
      days: Math.floor(
        difference / (1000 * 60 * 60 * 24)
      ),

      hours: Math.floor(
        (difference / (1000 * 60 * 60)) % 24
      ),

      minutes: Math.floor(
        (difference / (1000 * 60)) % 60
      ),

      seconds: Math.floor(
        (difference / 1000) % 60
      ),
    };
  };

  const [timeLeft, setTimeLeft] =
    useState(calculateTime());

  useEffect(() => {

    const timer = setInterval(() => {
      setTimeLeft(calculateTime());
    }, 1000);

    return () => clearInterval(timer);

  }, []);

  if (!timeLeft)
    return <h2>🎉 Capsule Unlocked!</h2>;

  return (
    <div>
      <h2>
        {timeLeft.days}d
        {" "}
        {timeLeft.hours}h
        {" "}
        {timeLeft.minutes}m
        {" "}
        {timeLeft.seconds}s
      </h2>
    </div>
  );
}

export default Countdown;
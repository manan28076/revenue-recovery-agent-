// Prototype Policy v1
// These constants define the mathematical boundaries of the strategy engine

// Max number of automated retries before routing to a human
export const MAX_RETRIES = 3;

// Max expected spend (in paise) per day before triggering the circuit breaker
// e.g. 100000 paise = 1000 INR
export const MAX_DAILY_INTERVENTION_SPEND = 100000;

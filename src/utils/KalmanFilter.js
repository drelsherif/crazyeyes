export default class KalmanFilter {
  constructor(Q = 0.1, R = 10) {
    this.Q = Q;
    this.R = R;
    this.x = 0;
    this.P = 1;
    this.initialized = false;
  }

  init(value) {
    this.x = value;
    this.P = 1;
    this.initialized = true;
  }

  update(measurement) {
    if (!this.initialized) {
      this.init(measurement);
    }

    this.P += this.Q;
    const K = this.P / (this.P + this.R);
    this.x += K * (measurement - this.x);
    this.P *= (1 - K);
    return this.x;
  }
}